// src/lib/notifications.ts
// Centro de notificaciones: estado compartido y API única para crear avisos desde cualquier función.
// Los avisos viven cifrados en el backend (notifications.json); aquí solo se guarda una copia en memoria.
import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";

export type NotificationSeverity = "info" | "warning" | "security" | "success";

export const NOTIFICATION_SEVERITIES: NotificationSeverity[] = ["info", "warning", "security", "success"];

// Botón de un aviso: `id` elige el texto (notifications:action_<id>) y `target` es la vista a la que lleva.
export interface NotificationAction {
  id: string;
  target?: string;
}

// Tipos con aviso automático. Los textos salen de notifications:kind_<tipo>_title / _body.
export type NotificationKind = "update" | "backup" | "passwords";

export const NOTIFICATION_KINDS: NotificationKind[] = ["update", "backup", "passwords"];

export interface AppNotification {
  id: string;
  kind: string; // un NotificationKind u otro tipo que cree una función futura
  severity?: NotificationSeverity | null;
  dismissible?: boolean | null; // false = no se puede borrar hasta que esté leído
  actions?: NotificationAction[];
  data: Record<string, number | string> | null;
  read: boolean;
  created_at: number;
}

// Valores por defecto de cada tipo conocido. También cubren los avisos guardados antes de existir estos campos.
const KIND_DEFAULTS: Record<NotificationKind, { severity: NotificationSeverity; actions: NotificationAction[] }> = {
  update: { severity: "info", actions: [{ id: "openSettings", target: "settings" }] },
  backup: { severity: "warning", actions: [{ id: "exportBackup", target: "settings" }] },
  passwords: { severity: "security", actions: [{ id: "reviewPasswords", target: "vault" }] },
};

function defaultsFor(kind: string) {
  return (KIND_DEFAULTS as Record<string, (typeof KIND_DEFAULTS)[NotificationKind]>)[kind];
}

export function severityOf(n: AppNotification): NotificationSeverity {
  return n.severity ?? defaultsFor(n.kind)?.severity ?? "info";
}

export function actionsOf(n: AppNotification): NotificationAction[] {
  return n.actions && n.actions.length > 0 ? n.actions : defaultsFor(n.kind)?.actions ?? [];
}

// Un aviso no descartable solo se puede borrar una vez leído.
export function canDelete(n: AppNotification): boolean {
  return n.dismissible !== false || n.read;
}

// ---------- Avisos (en memoria) ----------

let items: AppNotification[] = [];
const listeners = new Set<() => void>();

function setItems(next: AppNotification[]) {
  items = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(subscribe, () => items);
}

// Al bloquear la bóveda se vacía la copia en memoria.
export function resetNotifications() {
  setItems([]);
}

export async function refreshNotifications() {
  setItems(await invoke<AppNotification[]>("load_notifications"));
}

export interface NotifyOptions {
  kind: string; // minúsculas, números y "_"
  key: string; // identifica el aviso para no repetirlo (p. ej. "update:2.4.0")
  data?: Record<string, number | string>;
  severity?: NotificationSeverity;
  dismissible?: boolean;
  actions?: NotificationAction[];
}

// API única para crear avisos. Cualquier función de la app puede llamarla; la interfaz es siempre la misma.
export async function notify({ kind, key, data = {}, severity, dismissible, actions }: NotifyOptions) {
  const defaults = defaultsFor(kind);
  setItems(
    await invoke<AppNotification[]>("add_notification", {
      kind,
      key,
      data,
      severity: severity ?? defaults?.severity ?? "info",
      dismissible: dismissible ?? true,
      actions: actions ?? defaults?.actions ?? [],
    })
  );
}

// Atajo para los avisos con valores por defecto.
export const addNotification = (kind: string, key: string, data: Record<string, number | string> = {}) =>
  notify({ kind, key, data });

export async function markNotificationRead(id: string, read: boolean) {
  setItems(await invoke<AppNotification[]>("mark_notification_read", { id, read }));
}

export async function markAllNotificationsRead() {
  setItems(await invoke<AppNotification[]>("mark_all_notifications_read"));
}

export async function deleteNotification(id: string) {
  setItems(await invoke<AppNotification[]>("delete_notification", { id }));
}

export async function clearNotifications() {
  setItems(await invoke<AppNotification[]>("clear_notifications"));
}

// ---------- Preferencias: qué avisos se generan (solo en este equipo) ----------

export type NotificationPrefs = Record<NotificationKind, boolean>;

const PREFS_KEY = "sailock.notificationPrefs";
const DEFAULT_PREFS: NotificationPrefs = { update: true, backup: true, passwords: true };

function loadPrefs(): NotificationPrefs {
  const prefs = { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<NotificationKind, unknown>>;
      for (const kind of NOTIFICATION_KINDS) {
        if (typeof saved[kind] === "boolean") prefs[kind] = saved[kind] as boolean;
      }
    }
  } catch {
    // sin almacenamiento o datos dañados: valores por defecto
  }
  return prefs;
}

let prefs: NotificationPrefs = loadPrefs();
const prefListeners = new Set<() => void>();

export function getNotificationPrefs(): NotificationPrefs {
  return prefs;
}

export function useNotificationPrefs(): NotificationPrefs {
  return useSyncExternalStore(
    (listener) => {
      prefListeners.add(listener);
      return () => {
        prefListeners.delete(listener);
      };
    },
    getNotificationPrefs
  );
}

export function setNotificationPref(kind: NotificationKind, value: boolean) {
  prefs = { ...prefs, [kind]: value };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // el ajuste vale solo hasta cerrar la app
  }
  prefListeners.forEach((l) => l());
}

// ---------- Copia de seguridad: cuándo se exportó por última vez ----------

const LAST_BACKUP_KEY = "sailock.lastBackup";
const BACKUP_BASELINE_KEY = "sailock.backupBaseline";

function readNumber(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

// Fecha de la última copia creada en este equipo, o null si nunca se hizo ninguna.
export function getLastBackup(): number | null {
  return readNumber(LAST_BACKUP_KEY);
}

// Se llama al terminar una exportación correcta.
export function recordBackup() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
  } catch {
    // sin almacenamiento: el recordatorio seguirá contando desde antes
  }
}

// Fecha desde la que se cuentan los días sin copia: la última exportación o, si nunca hubo una,
// el primer día que se comprobó (así un usuario existente no recibe el aviso nada más actualizar).
export function backupReferenceDate(): number {
  const last = readNumber(LAST_BACKUP_KEY);
  const baseline = readNumber(BACKUP_BASELINE_KEY);
  if (last) return Math.max(last, baseline ?? 0);
  if (baseline) return baseline;
  const now = Date.now();
  try {
    localStorage.setItem(BACKUP_BASELINE_KEY, String(now));
  } catch {
    // sin almacenamiento: se volverá a intentar la próxima vez
  }
  return now;
}