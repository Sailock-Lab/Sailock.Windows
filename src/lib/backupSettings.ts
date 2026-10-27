// src/lib/backupSettings.ts
// Ajustes de las copias de seguridad (nombre del fichero, formato de fecha y qué se incluye) y utilidades
// para guardar y restaurar las preferencias de la interfaz dentro de una copia.

export type BackupSection = "entries" | "folders" | "taxonomy" | "templates" | "notes" | "totp" | "settings";

export const BACKUP_SECTIONS: BackupSection[] = [
  "entries",
  "folders",
  "taxonomy",
  "templates",
  "notes",
  "totp",
  "settings",
];

export type BackupDateFormat = "dateTime" | "date" | "compact" | "eu" | "none";

export const BACKUP_DATE_FORMATS: BackupDateFormat[] = ["dateTime", "date", "compact", "eu", "none"];

export const DEFAULT_BACKUP_PREFIX = "sailock-backup";
const MAX_PREFIX_LENGTH = 40;

// Configuración de las copias automáticas tal como la devuelve el backend (get_backup_config).
export interface BackupConfig {
  enabled: boolean;
  folder: string;
  has_password: boolean;
  frequency_days: number;
  prefix: string;
  date_format: BackupDateFormat;
  sections: BackupSection[];
  keep: number;
  last_run: number;
}

export const FREQUENCY_PRESETS = [1, 2, 3, 7, 14, 30];
export const KEEP_OPTIONS = [3, 5, 10, 20, 50, 0];
const DAY_MS = 24 * 60 * 60 * 1000;

// Cuándo toca la siguiente copia (marca de tiempo en ms). Si nunca se hizo ninguna, ya toca.
export function nextBackupAt(config: Pick<BackupConfig, "frequency_days" | "last_run">): number {
  return config.last_run === 0 ? 0 : config.last_run + config.frequency_days * DAY_MS;
}

export function isBackupDue(config: BackupConfig, now = Date.now()): boolean {
  return config.enabled && config.folder !== "" && config.has_password && now >= nextBackupAt(config);
}

// Solo letras, números, punto, guion y guion bajo: vale como nombre de fichero en cualquier sistema.
export function sanitizePrefix(value: string): string {
  const clean = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.\-_]+|[.\-]+$/g, "")
    .slice(0, MAX_PREFIX_LENGTH);
  return clean || DEFAULT_BACKUP_PREFIX;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatBackupDate(format: BackupDateFormat, date = new Date()): string {
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  switch (format) {
    case "dateTime":
      return `${y}-${mo}-${d}_${h}-${mi}`;
    case "date":
      return `${y}-${mo}-${d}`;
    case "compact":
      return `${y}${mo}${d}-${h}${mi}`;
    case "eu":
      return `${d}-${mo}-${y}_${h}-${mi}`;
    default:
      return "";
  }
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// Nombre final del fichero, p. ej. "sailock-backup_2026-10-26_14-30.slock".
export function backupFileName(prefs: { prefix: string; dateFormat: BackupDateFormat }, date = new Date()): string {
  let base = sanitizePrefix(prefs.prefix);
  const stamp = formatBackupDate(prefs.dateFormat, date);
  if (!stamp && WINDOWS_RESERVED.test(base)) base = `${base}-backup`;
  return `${base}${stamp ? `_${stamp}` : ""}.slock`;
}

// ---------- Preferencias de la interfaz dentro de la copia ----------

// Claves que no viajan: describen ESTE equipo, no las preferencias del usuario.
const EXCLUDED_KEYS = new Set(["sailock.lastBackup", "sailock.backupBaseline", "sailock.twofaBaseline"]);
const MAX_SETTING_KEYS = 100;
const MAX_SETTING_VALUE_LENGTH = 10_000;

// Si guardas más ajustes en localStorage con otro prefijo (tema, idioma, tamaño de texto...), añade aquí sus claves.
const EXTRA_SETTING_KEYS: string[] = [];

function isSettingKey(key: string): boolean {
  return (key.startsWith("sailock") || EXTRA_SETTING_KEYS.includes(key)) && !EXCLUDED_KEYS.has(key);
}

// JSON con las preferencias para guardar en la copia, o null si no hay ninguna.
export function collectSettings(): string | null {
  const values: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isSettingKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null && value.length <= MAX_SETTING_VALUE_LENGTH) values[key] = value;
    }
  } catch {
    return null;
  }
  return Object.keys(values).length > 0 ? JSON.stringify(values) : null;
}

// Restaura las preferencias de una copia. Solo acepta claves de Sailock con texto corto. Devuelve cuántas aplicó.
export function applySettings(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  let applied = 0;
  try {
    for (const [key, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_SETTING_KEYS)) {
      if (!isSettingKey(key) || typeof v !== "string" || v.length > MAX_SETTING_VALUE_LENGTH) continue;
      localStorage.setItem(key, v);
      applied++;
    }
  } catch {
    // almacenamiento no disponible
  }
  return applied;
}