export function maskPhone(value: string): string {
  let v = value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) {
    v = v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
  } else if (v.length > 6) {
    v = v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
  } else if (v.length > 2) {
    v = v.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
  } else if (v.length > 0) {
    v = v.replace(/^(\d*)/, '($1');
  }
  return v;
}

// Fase 17.4 -- número como o WhatsApp manda no webhook: código do país (55)
// + DDD + número, sem "+" e sem máscara (ex.: "5531900009001"). Diferente de
// maskPhone acima, que é máscara de digitação de telefone LOCAL (sem
// código de país) nos formulários de pedido -- reaproveitar aquela aqui
// cortaria os 2 dígitos errados. Formato inesperado (não é 55 + 10 ou 11
// dígitos) devolve como veio, sem inventar separador.
export function formatWhatsappPhone(raw: string): string {
  const digitos = raw.replace(/\D/g, '');
  if (!/^55\d{10,11}$/.test(digitos)) return raw;
  const ddd = digitos.slice(2, 4);
  const numero = digitos.slice(4);
  const meio = numero.length === 9 ? numero.slice(0, 5) : numero.slice(0, 4);
  const fim = numero.length === 9 ? numero.slice(5) : numero.slice(4);
  return `+55 (${ddd}) ${meio}-${fim}`;
}
