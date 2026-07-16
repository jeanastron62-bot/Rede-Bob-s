const CUTOFF_HOUR = 18; // antes das 18h (00:00–17:59) é a janela bloqueada, salvo extensão ativa

export function isDeliveryTimeBlocked(
  config: { deliveryExtendedUntil: Date | null },
  now: Date = new Date()
): boolean {
  const isBeforeCutoff = now.getHours() < CUTOFF_HOUR;
  const hasActiveExtension = config.deliveryExtendedUntil !== null && now < config.deliveryExtendedUntil;
  return isBeforeCutoff && !hasActiveExtension;
}
