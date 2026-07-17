// Espelha backend/src/utils/shift.ts: expediente vai das 18h as 05h, atravessando
// a meia-noite. Usado como periodo padrao do dashboard ADM/TI ("hoje" != dia civil).
export function getShiftRange(): { from: Date; to: Date } {
  const now = new Date();

  const shiftStart = new Date(now);
  shiftStart.setHours(12, 0, 0, 0);

  if (now.getHours() < 12) {
    shiftStart.setDate(shiftStart.getDate() - 1);
  }

  const shiftEnd = new Date(shiftStart);
  shiftEnd.setDate(shiftEnd.getDate() + 1);
  shiftEnd.setHours(11, 59, 59, 999);

  return { from: shiftStart, to: shiftEnd };
}
