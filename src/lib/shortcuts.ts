import { useSyncExternalStore } from "react";

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

export type ShortcutAction =
  | "lock"
  | "help"
  | "quit"
  | "goVault"
  | "goGenerator"
  | "goActivity"
  | "goSettings"
  | "search"
  | "newEntry"
  | "copyUsername"
  | "copyPassword"
  | "copyTotp"
  | "zoomIn"
  | "zoomOut"
  | "zoomReset"
  | "fullscreen"
  | "minimize"
  | "alwaysOnTop";

export const SHORTCUT_GROUPS: { titleKey: string; actions: ShortcutAction[] }[] = [
  { titleKey: "shortcutsGroupGeneral", actions: ["lock", "help", "quit"] },
  { titleKey: "shortcutsGroupNavigation", actions: ["goVault", "goGenerator", "goActivity", "goSettings"] },
  { titleKey: "shortcutsGroupVault", actions: ["search", "newEntry", "copyUsername", "copyPassword", "copyTotp"] },
  { titleKey: "shortcutsGroupDisplay", actions: ["zoomIn", "zoomOut", "zoomReset", "fullscreen"] },
  { titleKey: "shortcutsGroupWindow", actions: ["minimize", "alwaysOnTop"] },
];

export const SHORTCUT_ACTIONS: ShortcutAction[] = SHORTCUT_GROUPS.flatMap((g) => g.actions);

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  lock: "Mod+L",
  help: "?",
  quit: "Mod+Q",
  goVault: "Mod+1",
  goGenerator: "Mod+2",
  goActivity: "Mod+3",
  goSettings: "Mod+4",
  search: "Mod+K",
  newEntry: "Mod+N",
  copyUsername: "Mod+Shift+U",
  copyPassword: "Mod+Shift+P",
  copyTotp: "Mod+Shift+O",
  zoomIn: "Mod+=",
  zoomOut: "Mod+-",
  zoomReset: "Mod+0",
  fullscreen: "F11",
  minimize: "Mod+M",
  alwaysOnTop: "Mod+Shift+T",
};

const STORAGE_KEY = "sailock.shortcuts";

type Bindings = Record<ShortcutAction, string>; // "" = sin asignar

function loadBindings(): Bindings {
  const merged: Bindings = { ...DEFAULT_SHORTCUTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<ShortcutAction, unknown>>;
      for (const action of SHORTCUT_ACTIONS) {
        const value = saved[action];
        if (typeof value === "string") merged[action] = value;
      }
    }
  } catch {
  }
  return merged;
}

function saveBindings(b: Bindings) {
  try {
    const changed: Partial<Bindings> = {};
    for (const action of SHORTCUT_ACTIONS) {
      if (b[action] !== DEFAULT_SHORTCUTS[action]) changed[action] = b[action];
    }
    if (Object.keys(changed).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(changed));
  } catch {
  }
}

let bindings: Bindings = loadBindings();
const listeners = new Set<() => void>();

function commit(next: Bindings) {
  bindings = next;
  saveBindings(next);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getShortcuts(): Bindings {
  return bindings;
}

export function useShortcutBindings(): Bindings {
  return useSyncExternalStore(subscribe, getShortcuts);
}

export function setShortcut(action: ShortcutAction, combo: string) {
  commit({ ...bindings, [action]: combo });
}

export function resetShortcut(action: ShortcutAction) {
  commit({ ...bindings, [action]: DEFAULT_SHORTCUTS[action] });
}

export function resetAllShortcuts() {
  commit({ ...DEFAULT_SHORTCUTS });
}

let recording = false;
export function setShortcutRecording(value: boolean) {
  recording = value;
}
export function isShortcutRecording() {
  return recording;
}


const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "OS"]);

export function comboFromEvent(e: KeyboardEvent): string | null {
  if (e.isComposing || MODIFIER_KEYS.has(e.key)) return null;
  if (e.getModifierState && e.getModifierState("AltGraph")) return null;

  let key = e.key;
  if (IS_MAC && e.altKey && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (IS_MAC && e.altKey && /^Digit\d$/.test(e.code)) key = e.code.slice(5);

  if (key === " ") key = "Space";
  else if (key === "+") key = "="; 
  else if (key.length === 1) key = key.toUpperCase();

  const parts: string[] = [];
  if (IS_MAC ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (IS_MAC && e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey && (/^[A-Z]$/.test(key) || key.length > 1)) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

const KEY_LABELS: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  Delete: "Supr",
};

export function formatCombo(combo: string): string[] {
  if (!combo) return [];
  return combo.split("+").map((part) => {
    if (part === "Mod") return IS_MAC ? "⌘" : "Ctrl";
    if (part === "Ctrl") return "⌃";
    if (part === "Alt") return IS_MAC ? "⌥" : "Alt";
    if (part === "Shift") return IS_MAC ? "⇧" : "Shift";
    return KEY_LABELS[part] ?? part;
  });
}

export function formatComboText(combo: string): string {
  return formatCombo(combo).join("+");
}

export function comboHasModifier(combo: string): boolean {
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1).filter((p) => p !== "Shift");
  return mods.length > 0 || /^F\d{1,2}$/.test(key);
}

// Combinaciones que ya hacen algo en la app o en el sistema y no se pueden reasignar.
const RESERVED = new Set([
  "Mod+C", "Mod+V", "Mod+X", "Mod+A", "Mod+Z", "Mod+Y", "Mod+Shift+Z",
  "Mod+R", "Mod+Shift+R", "Mod+U", "Mod+Shift+I", "Mod+W", "Mod+P",
  "F5", "F12", "Tab", "Shift+Tab", "Enter", "Escape", "Space", "Backspace", "Delete",
]);

export type ComboError = { type: "reserved" } | { type: "needModifier" } | { type: "inUse"; action: ShortcutAction };

export function validateCombo(action: ShortcutAction, combo: string): ComboError | null {
  if (RESERVED.has(combo)) return { type: "reserved" };
  const key = combo.split("+").pop() ?? "";
  if (!comboHasModifier(combo) && key !== "?" && key !== "/") return { type: "needModifier" };
  const other = SHORTCUT_ACTIONS.find((a) => a !== action && bindings[a] === combo);
  if (other) return { type: "inUse", action: other };
  return null;
}