export function getShiftRange(): { from: Date; to: Date } {
  // O fuso TZ="America/Sao_Paulo" faz com que o 'new Date()' do NodeJS use o fuso correto localmente.
  // Expediente: 12:00 até 11:59 do dia seguinte.
  const now = new Date();
  
  let shiftStart = new Date(now);
  shiftStart.setHours(12, 0, 0, 0);

  // Se agora é antes de meio-dia, pertence ao expediente do dia anterior
  if (now.getHours() < 12) {
    shiftStart.setDate(shiftStart.getDate() - 1);
  }

  let shiftEnd = new Date(shiftStart);
  shiftEnd.setDate(shiftEnd.getDate() + 1);
  shiftEnd.setHours(11, 59, 59, 999);

  return { from: shiftStart, to: shiftEnd };
}
