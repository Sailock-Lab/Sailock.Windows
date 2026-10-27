// src/lib/notificationChecks.ts
// Comprobaciones que generan avisos: actualización (con las notas de la versión), copias de seguridad,
// contraseñas antiguas o débiles, 2FA desactivado e intentos fallidos de desbloqueo.
// Cada aviso lleva una clave que impide repetirlo (por versión, por mes...).
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { addNotification, backupReferenceDate, getLastBackup, getNotificationPrefs, notify } from "@/lib/notifications";
import { BackupConfig } from "@/lib/backupSettings";

const DAY_MS = 24 * 60 * 60 * 1000;
export const BACKUP_REMINDER_DAYS = 7;
const OLD_PASSWORD_DAYS = 180;
const TWOFA_REMINDER_DAYS = 3;
const MAX_RELEASE_NOTES = 6000;
const SECURITY_RELEASE = /\b(security|seguridad|vulnerab\w*)\b|CVE-\d/i;
const TWOFA_BASELINE_KEY = "sailock.twofaBaseline";
const MIN_PASSWORD_LENGTH = 8;

const COMMON_PASSWORDS = new Set([
  "password", "password1", "123456", "12345678", "123456789", "1234567890", "qwerty", "qwerty123",
  "abc123", "111111", "000000", "letmein", "welcome", "admin", "iloveyou", "contraseña",
]);

interface EntryForReview {
  password?: string | null;
  trashed: boolean;
  updated_at: number;
}

export interface PasswordReview {
  reused: number;
  weak: number;
  old: number;
}

function isWeak(password: string): boolean {
  if (password.length < MIN_PASSWORD_LENGTH) return true;
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return true;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  return classes < 2;
}

// Cuenta registros, sin guardar ni mostrar ningún nombre ni contraseña.
export function reviewPasswords(entries: EntryForReview[], now = Date.now()): PasswordReview {
  const active = entries.filter((e) => !e.trashed && e.password && e.password.length > 0);
  const counts = new Map<string, number>();
  for (const e of active) counts.set(e.password as string, (counts.get(e.password as string) ?? 0) + 1);
  let reused = 0;
  let weak = 0;
  let old = 0;
  for (const e of active) {
    const password = e.password as string;
    if ((counts.get(password) ?? 0) > 1) reused++;
    if (isWeak(password)) weak++;
    if (now - e.updated_at > OLD_PASSWORD_DAYS * DAY_MS) old++;
  }
  return { reused, weak, old };
}

function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function checkUpdate() {
  const update = await check();
  if (!update) return;
  const notes = (update.body ?? "").trim().slice(0, MAX_RELEASE_NOTES);
  // Una versión que habla de seguridad se avisa como tal.
  const kind = SECURITY_RELEASE.test(notes) ? "security_update" : "update";
  await addNotification(kind, `update:${update.version}`, { version: update.version, notes });
}

async function checkBackup() {
  const now = Date.now();
  let config: BackupConfig | null = null;
  try {
    config = await invoke<BackupConfig>("get_backup_config");
  } catch {
    config = null;
  }

  if (config && config.enabled && config.folder && config.has_password) {
    // Con copias automáticas solo se avisa si llevan mucho sin crearse (carpeta no disponible, app casi sin abrir...).
    const last = Math.max(config.last_run, getLastBackup() ?? 0) || backupReferenceDate();
    const limitDays = Math.max(3, config.frequency_days * 2);
    const days = Math.floor((now - last) / DAY_MS);
    if (days >= limitDays) await addNotification("backup_failed", `backup_failed:${monthKey()}`, { days });
    return;
  }

  const days = Math.floor((now - backupReferenceDate()) / DAY_MS);
  if (days >= BACKUP_REMINDER_DAYS) {
    // Primer aviso a los 7 días y después uno cada 30.
    await addNotification("backup_reminder", `backup_reminder:${Math.floor(days / 30)}`, { days });
  }
}

async function checkPasswords() {
  const entries = await invoke<EntryForReview[]>("load_entries");
  const review = reviewPasswords(entries);
  if (review.old > 0) {
    await addNotification("passwords_old", `passwords_old:${monthKey()}`, { count: review.old });
  }
  if (review.reused + review.weak > 0) {
    await addNotification("passwords_weak", `passwords_weak:${monthKey()}`, {
      reused: review.reused,
      weak: review.weak,
    });
  }
}

// Recuerda activar el 2FA cuando lleva unos días desactivado, y repite cada mes.
async function checkTwoFactor() {
  const enabled = await invoke<boolean>("totp_status");
  try {
    if (enabled) {
      localStorage.removeItem(TWOFA_BASELINE_KEY);
      return;
    }
    const now = Date.now();
    const saved = Number(localStorage.getItem(TWOFA_BASELINE_KEY));
    const since = Number.isFinite(saved) && saved > 0 ? saved : now;
    if (since === now) localStorage.setItem(TWOFA_BASELINE_KEY, String(now));
    if (now - since >= TWOFA_REMINDER_DAYS * DAY_MS) {
      await addNotification("twofa_disabled", `twofa_disabled:${monthKey()}`, {});
    }
  } catch {
    // sin almacenamiento: no se puede saber desde cuándo está desactivado
  }
}

// Intentos fallidos de desbloqueo desde la última vez. El contador se pone a cero aunque el aviso esté desactivado.
async function checkFailedUnlocks(notifyUser: boolean) {
  const failed = await invoke<{ count: number; last_at: number }>("take_failed_unlocks");
  if (notifyUser && failed.count > 0) {
    await notify({
      kind: "alert_failed_unlocks",
      key: `alert_failed_unlocks:${failed.last_at}`,
      data: { count: failed.count, last: failed.last_at },
      dismissible: false,
    });
  }
}

// `checkUpdates`: si el usuario permite que la app consulte nuevas versiones (ajuste de actualización automática).
export async function runNotificationChecks(checkUpdates: boolean) {
  const prefs = getNotificationPrefs();
  const jobs: Promise<void>[] = [checkFailedUnlocks(prefs.security)];
  if (prefs.updates && checkUpdates) jobs.push(checkUpdate());
  if (prefs.backup) jobs.push(checkBackup());
  if (prefs.passwords) jobs.push(checkPasswords());
  if (prefs.security) jobs.push(checkTwoFactor());
  // Un fallo en una comprobación (por ejemplo, sin internet) no impide las demás.
  await Promise.allSettled(jobs);
}