// src/lib/securityAlerts.ts
// Avisos de lo que acaba de pasar en la cuenta (cambios de seguridad, exportaciones...). Son los mismos
// hechos que ya se anotan en la auditoría, pero visibles al momento. Nunca llevan contraseñas ni nombres.
import { NotificationKind, getNotificationPrefs, notify } from "@/lib/notifications";

export type AlertKind = Extract<NotificationKind, `alert_${string}`>;

// Se llama justo después de guardar la actividad. Si falla, no molesta a quien hizo la acción.
export function alertEvent(kind: AlertKind) {
  if (!getNotificationPrefs().security) return;
  notify({ kind, key: `${kind}:${Date.now()}` }).catch(() => {});
}