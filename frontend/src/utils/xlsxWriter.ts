// Gerador mínimo de .xlsx (Office Open XML), sem biblioteca de planilha.
//
// Por que não SheetJS/ExcelJS: o `xlsx` do npm parou em 0.18.5 com CVEs
// abertas (prototype pollution, ReDoS) e o ExcelJS pesa ~1 MB. Um .xlsx é só
// um zip com meia dúzia de XMLs; o que este projeto precisa (texto, número,
// negrito no cabeçalho, formato de moeda, largura de coluna, várias abas)
// cabe em ~100 linhas que ficam sob controle. A única dependência é o
// fflate, pra zipar. Importado por import dinâmico (ver reportXlsx.ts) --
// nunca entra no bundle público.

// Célula pode ser valor cru ou { value, format } quando a coluna mistura
// tipos (ex.: aba "Resumo", com R$ e contagens na mesma coluna).
export type MoneyCell = { value: number; format: 'money' };
export type CellValue = string | number | MoneyCell | null | undefined;

export interface XlsxSheet {
  name: string;
  rows: CellValue[][];
  // Índices (0-based) das colunas cujo NÚMERO é dinheiro em reais -> formato "R$ #.##0,00".
  moneyColumns?: number[];
  // Largura por coluna, em caracteres. Faltando, usa 14.
  columnWidths?: number[];
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// Estilos fixos (índice em cellXfs): 0 = padrão, 1 = negrito (cabeçalho),
// 2 = moeda. numFmt 164 é o primeiro id livre pra formato customizado.
const STYLE_DEFAULT = 0;
const STYLE_BOLD = 1;
const STYLE_MONEY = 2;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Caracteres de controle não são válidos em XML 1.0 -- observação com
// quebra de linha/tab é aceita, o resto sai.
function sanitizeText(s: string): string {
  // oxlint-disable-next-line no-control-regex -- intencional: é exatamente o que precisa sair
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// Excel: máximo 31 caracteres, sem [ ] : * ? / \ .
export function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim();
  return (cleaned || 'Planilha').slice(0, 31);
}

function buildSheetXml(sheet: XlsxSheet): string {
  const money = new Set(sheet.moneyColumns ?? []);
  const colCount = sheet.rows.reduce((max, r) => Math.max(max, r.length), 0);

  let cols = '';
  if (colCount > 0) {
    cols = '<cols>';
    for (let c = 0; c < colCount; c++) {
      const width = sheet.columnWidths?.[c] ?? 14;
      cols += `<col min="${c + 1}" max="${c + 1}" width="${width}" customWidth="1"/>`;
    }
    cols += '</cols>';
  }

  let data = '<sheetData>';
  sheet.rows.forEach((row, r) => {
    data += `<row r="${r + 1}">`;
    row.forEach((value, c) => {
      if (value === null || value === undefined || value === '') return;
      const ref = `${columnLetter(c)}${r + 1}`;
      if (typeof value === 'object') {
        if (!Number.isFinite(value.value)) return;
        data += `<c r="${ref}" s="${STYLE_MONEY}"><v>${value.value}</v></c>`;
      } else if (typeof value === 'number') {
        if (!Number.isFinite(value)) return;
        const style = money.has(c) ? STYLE_MONEY : STYLE_DEFAULT;
        data += `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
      } else {
        const style = r === 0 ? STYLE_BOLD : STYLE_DEFAULT;
        data += `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(sanitizeText(String(value)))}</t></is></c>`;
      }
    });
    data += '</row>';
  });
  data += '</sheetData>';

  return `${XML_HEADER}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">${cols}${data}</worksheet>`;
}

const STYLES_XML = `${XML_HEADER}<styleSheet xmlns="${NS_MAIN}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$ &quot;#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Monta o pacote e devolve os bytes do .xlsx.
export async function buildXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  if (sheets.length === 0) throw new Error('Planilha precisa de pelo menos uma aba.');
  const { zipSync, strToU8 } = await import('fflate');

  const files: Record<string, Uint8Array> = {};
  const names = new Set<string>();
  const safeSheets = sheets.map((s) => {
    let name = sanitizeSheetName(s.name);
    let i = 2;
    while (names.has(name)) name = `${name.slice(0, 28)} ${i++}`;
    names.add(name);
    return { ...s, name };
  });

  let sheetsXml = '';
  let relsXml = '';
  let overrides = '';
  safeSheets.forEach((sheet, i) => {
    const n = i + 1;
    files[`xl/worksheets/sheet${n}.xml`] = strToU8(buildSheetXml(sheet));
    sheetsXml += `<sheet name="${escapeXml(sheet.name)}" sheetId="${n}" r:id="rId${n}"/>`;
    relsXml += `<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`;
    overrides += `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  });
  const stylesRelId = `rId${safeSheets.length + 1}`;

  files['[Content_Types].xml'] = strToU8(`${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${overrides}</Types>`);

  files['_rels/.rels'] = strToU8(`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);

  files['xl/workbook.xml'] = strToU8(`${XML_HEADER}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${sheetsXml}</sheets></workbook>`);

  files['xl/_rels/workbook.xml.rels'] = strToU8(`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relsXml}<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  files['xl/styles.xml'] = strToU8(STYLES_XML);

  return zipSync(files, { level: 6 });
}

export function downloadXlsx(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
