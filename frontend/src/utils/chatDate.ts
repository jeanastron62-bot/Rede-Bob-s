// Fase 17.4 (visual) -- datas/horas compartilhadas entre a lista e a thread
// do Atendimento. Centralizado porque as duas telas cruzam meia-noite dentro
// do corte de 12h (ex.: olhando às 2h, mensagem de ontem às 20h ainda está
// na janela) e precisam da MESMA regra de "hoje/ontem/data".

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Rótulo do horário na LISTA: hoje mostra só a hora (como WhatsApp/Telegram);
// antes de hoje mostra "ontem" ou a data curta -- nunca a hora sozinha de um
// dia que não é hoje, que enganaria sobre quando a mensagem chegou.
export function horaOuDataCurta(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  if (mesmoDia(data, hoje)) return horaCurta(iso);
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (mesmoDia(data, ontem)) return 'ontem';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Separador de dia dentro da THREAD.
export function separadorData(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  if (mesmoDia(data, hoje)) return 'Hoje';
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (mesmoDia(data, ontem)) return 'Ontem';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
