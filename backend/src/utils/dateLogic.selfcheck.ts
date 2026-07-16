// Self-check para a lógica pura de datas mais crítica do projeto (dinheiro/horário
// de corte). Sem framework de teste no projeto: roda com `npx tsx src/utils/dateLogic.selfcheck.ts`.
import assert from 'node:assert';
import { isDeliveryTimeBlocked } from './deliveryWindow';
import { parseLocalDayBoundary } from './shift';

// isDeliveryTimeBlocked: 4 quadrantes (antes/depois das 18h × com/sem extensão ativa)
assert.strictEqual(isDeliveryTimeBlocked({ deliveryExtendedUntil: null }, new Date('2026-07-16T10:00:00')), true, 'antes das 18h, sem extensão -> bloqueado');
assert.strictEqual(isDeliveryTimeBlocked({ deliveryExtendedUntil: null }, new Date('2026-07-16T20:00:00')), false, 'depois das 18h, sem extensão -> liberado');
assert.strictEqual(
  isDeliveryTimeBlocked({ deliveryExtendedUntil: new Date('2026-07-16T02:00:00') }, new Date('2026-07-16T01:00:00')),
  false,
  'antes das 18h, com extensão ainda vigente -> liberado'
);
assert.strictEqual(
  isDeliveryTimeBlocked({ deliveryExtendedUntil: new Date('2026-07-16T00:30:00') }, new Date('2026-07-16T01:00:00')),
  true,
  'antes das 18h, com extensão já expirada -> bloqueado'
);

// parseLocalDayBoundary: datas puras (sem horário) devem virar limites do dia local, não UTC
const from = parseLocalDayBoundary('2026-07-16', false);
const to = parseLocalDayBoundary('2026-07-16', true);
assert.strictEqual(from.getHours(), 0, 'início do dia deve ser 00:00 local');
assert.strictEqual(from.getMinutes(), 0);
assert.strictEqual(to.getHours(), 23, 'fim do dia deve ser 23:59:59.999 local');
assert.strictEqual(to.getMilliseconds(), 999);
assert.ok(from < to);

// String com horário explícito deve ser respeitada como veio (não reescrita para meia-noite/fim do dia)
const withTime = parseLocalDayBoundary('2026-07-16T15:30:00', false);
assert.strictEqual(withTime.getHours(), 15);
assert.strictEqual(withTime.getMinutes(), 30);

console.log('dateLogic.selfcheck: OK');
