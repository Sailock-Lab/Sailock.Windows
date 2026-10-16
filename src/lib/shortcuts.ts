// src/lib/shortcuts.ts
// Atajos de teclado configurables: acciones, combinaciones por defecto, guardado y utilidades.
// Una combinación se guarda como texto: "Mod+K", "Mod+Shift+N", "F2", "?"...
// "Mod" es Ctrl en Windows/Linux y Cmd en macOS.
import { useSyncExternalStore } from "react";

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

export type ShortcutAction =
  | "lock"
  | "help"
  | "quit"
  | "goVault"
  | "goTotp"
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

// Grupos tal y como se muestran en Ajustes (la clave es el texto traducido en el espacio "settings").
export const SHORTCUT_GROUPS: { titleKey: string; actions: ShortcutAction[] }[] = [
  { titleKey: "shortcutsGroupGeneral", actions: ["lock", "help", "quit"] },
  { titleKey: "shortcutsGroupNavigation", actions: ["goVault", "goTotp", "goGenerator", "goActivity", "goSettings"] },
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
  goTotp: "Mod+5",
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

// ---------- Guardado (solo en este equipo) ----------

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
    // sin almacenamiento o datos dañados: se usan los valores por defecto
  }
  return merged;
}

function saveBindings(b: Bindings) {
  try {
    // Solo se guardan las que difieren del valor por defecto.
    const changed: Partial<Bindings> = {};
    for (const action of SHORTCUT_ACTIONS) {
      if (b[action] !== DEFAULT_SHORTCUTS[action]) changed[action] = b[action];
    }
    if (Object.keys(changed).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(changed));
  } catch {
    // si no se puede guardar, el cambio vale solo hasta cerrar la app
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

// Mientras se está grabando una combinación nueva (en Ajustes), los atajos globales no actúan.
let recording = false;
export function setShortcutRecording(value: boolean) {
  recording = value;
}
export function isShortcutRecording() {
  return recording;
}

// ---------- Combinaciones ----------

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "OS"]);

// Convierte una pulsación en su combinación ("Mod+K"). Devuelve null si solo se pulsó un modificador.
export function comboFromEvent(e: KeyboardEvent): string | null {
  if (e.isComposing || MODIFIER_KEYS.has(e.key)) return null;
  // AltGr (Ctrl+Alt en Windows) sirve para escribir símbolos, no para atajos.
  if (e.getModifierState && e.getModifierState("AltGraph")) return null;

  let key = e.key;
  // En macOS, Option + letra produce otro carácter: se usa la tecla física.
  if (IS_MAC && e.altKey && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (IS_MAC && e.altKey && /^Digit\d$/.test(e.code)) key = e.code.slice(5);

  if (key === " ") key = "Space";
  else if (key === "+") key = "="; // Ctrl++ y Ctrl+= son la misma combinación (zoom)
  else if (key.length === 1) key = key.toUpperCase();

  const parts: string[] = [];
  if (IS_MAC ? e.metaKey : e.ctrlKey) parts.push("Mod");
  if (IS_MAC && e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  // Con símbolos y dígitos, Shift ya va incluido en el carácter ("?" o "!"), así que no se anota aparte.
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

// Partes de una combinación listas para mostrar: ["Ctrl", "K"].
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

// ¿Lleva modificador (o es una tecla de función)? Las que no, solo actúan cuando no se está escribiendo.
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