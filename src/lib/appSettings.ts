export type AutoLockDuration = "never" | "15s" | "30s" | "1m" | "2m" | "5m";
export type TextSize = "small" | "normal" | "large";

export const AUTO_LOCK_MS: Record<AutoLockDuration, number | null> = {
  never: null,
  "15s": 15_000,
  "30s": 30_000,
  "1m": 60_000,
  "2m": 120_000,
  "5m": 300_000,
};

const KEYS = {
  autoLockDuration: "sailock-auto-lock-duration",
  lockOnMinimize: "sailock-lock-on-minimize",
  startWithWindows: "sailock-start-with-windows",
  minimizeToTray: "sailock-minimize-to-tray",
  autoUpdate: "sailock-auto-update",
  reduceMotion: "sailock-reduce-motion",
  textSize: "sailock-text-size",
};

export function getStoredAutoLockDuration(): AutoLockDuration {
  const stored = localStorage.getItem(KEYS.autoLockDuration);
  if (stored && stored in AUTO_LOCK_MS) return stored as AutoLockDuration;
  return "never";
}
export function storeAutoLockDuration(value: AutoLockDuration) {
  localStorage.setItem(KEYS.autoLockDuration, value);
}

export function getStoredBool(key: keyof typeof KEYS, fallback: boolean): boolean {
  const stored = localStorage.getItem(KEYS[key]);
  if (stored === null) return fallback;
  return stored === "true";
}
export function storeBool(key: keyof typeof KEYS, value: boolean) {
  localStorage.setItem(KEYS[key], value ? "true" : "false");
}

const TEXT_SIZES: TextSize[] = ["small", "normal", "large"];

export function getStoredTextSize(): TextSize {
  const stored = localStorage.getItem(KEYS.textSize);
  if (stored && TEXT_SIZES.includes(stored as TextSize)) return stored as TextSize;
  return "normal";
}
export function storeTextSize(value: TextSize) {
  localStorage.setItem(KEYS.textSize, value);
}