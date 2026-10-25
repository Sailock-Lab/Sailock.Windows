// src/lib/notificationChecks.ts
// Comprobaciones que generan avisos: actualización disponible, copia de seguridad y revisión de contraseñas.
// Cada aviso lleva una clave que impide repetirlo (por versión o por mes).
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { addNotification, backupReferenceDate, getNotificationPrefs } from "@/lib/notifications";

const DAY_MS = 24 * 60 * 60 * 1000;
export const BACKUP_REMINDER_DAYS = 30;
const OLD_PASSWORD_DAYS = 365;
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
  if (update) await addNotification("update", `update:${update.version}`, { version: update.version });
}

async function checkBackup() {
  const days = Math.floor((Date.now() - backupReferenceDate()) / DAY_MS);
  if (days >= BACKUP_REMINDER_DAYS) await addNotification("backup", `backup:${monthKey()}`, { days });
}

async function checkPasswords() {
  const entries = await invoke<EntryForReview[]>("load_entries");
  const review = reviewPasswords(entries);
  if (review.reused + review.weak + review.old > 0) {
    await addNotification("passwords", `passwords:${monthKey()}`, { ...review });
  }
}

// `checkUpdates`: si el usuario permite que la app consulte nuevas versiones (ajuste de actualización automática).
export async function runNotificationChecks(checkUpdates: boolean) {
  const prefs = getNotificationPrefs();
  const jobs: Promise<void>[] = [];
  if (prefs.update && checkUpdates) jobs.push(checkUpdate());
  if (prefs.backup) jobs.push(checkBackup());
  if (prefs.passwords) jobs.push(checkPasswords());
  // Un fallo en una comprobación (por ejemplo, sin internet) no impide las demás.
  await Promise.allSettled(jobs);
}