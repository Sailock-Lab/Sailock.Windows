
import { useSyncExternalStore } from "react";

export const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.platform);

export type ShortcutAction =
  | "lock"
  | "help"
  | "quit"
  | "goVault"
  | "goTotp"
  | "goNotes"
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

// Grupos tal y como se muestran en Ajustes.
export const SHORTCUT_GROUPS: {
  titleKey: string;
  actions: ShortcutAction[];
}[] = [
  {
    titleKey: "shortcutsGroupGeneral",
    actions: ["lock", "help", "quit"],
  },
  {
    titleKey: "shortcutsGroupNavigation",
    actions: [
      "goVault",
      "goGenerator",
      "goTotp",
      "goNotes",
      "goActivity",
      "goSettings",
    ],
  },
  {
    titleKey: "shortcutsGroupVault",
    actions: [
      "search",
      "newEntry",
      "copyUsername",
      "copyPassword",
      "copyTotp",
    ],
  },
  {
    titleKey: "shortcutsGroupDisplay",
    actions: ["zoomIn", "zoomOut", "zoomReset", "fullscreen"],
  },
  {
    titleKey: "shortcutsGroupWindow",
    actions: ["minimize", "alwaysOnTop"],
  },
];

export const SHORTCUT_ACTIONS: ShortcutAction[] =
  SHORTCUT_GROUPS.flatMap((group) => group.actions);

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  lock: "Mod+L",
  help: "?",
  quit: "Mod+Q",

  // Navegación: coincide con el orden del sidebar.
  goVault: "Mod+1",
  goGenerator: "Mod+2",
  goTotp: "Mod+3",
  goNotes: "Mod+4",
  goActivity: "Mod+5",
  goSettings: "Mod+9",

  // Bóveda.
  search: "Mod+K",
  newEntry: "Mod+N",
  copyUsername: "Mod+Shift+U",
  copyPassword: "Mod+Shift+P",
  copyTotp: "Mod+Shift+O",

  // Pantalla.
  zoomIn: "Mod+=",
  zoomOut: "Mod+-",
  zoomReset: "Mod+0",
  fullscreen: "F11",

  // Ventana.
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
      const saved = JSON.parse(raw) as Partial<
        Record<ShortcutAction, unknown>
      >;

      for (const action of SHORTCUT_ACTIONS) {
        const value = saved[action];

        if (typeof value === "string") {
          merged[action] = value;
        }
      }
    }
  } catch {
    // Sin almacenamiento o datos dañados: se usan los valores por defecto.
  }

  return merged;
}

function saveBindings(bindingsToSave: Bindings) {
  try {
    // Solo se guardan las combinaciones que difieren de los valores por defecto.
    const changed: Partial<Bindings> = {};

    for (const action of SHORTCUT_ACTIONS) {
      if (
        bindingsToSave[action] !== DEFAULT_SHORTCUTS[action]
      ) {
        changed[action] = bindingsToSave[action];
      }
    }

    if (Object.keys(changed).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(changed));
    }
  } catch {
    // Si no se puede guardar, el cambio vale solo hasta cerrar la app.
  }
}

let bindings: Bindings = loadBindings();
const listeners = new Set<() => void>();

function commit(next: Bindings) {
  bindings = next;
  saveBindings(next);
  listeners.forEach((listener) => listener());
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
  commit({
    ...bindings,
    [action]: DEFAULT_SHORTCUTS[action],
  });
}

export function resetAllShortcuts() {
  commit({ ...DEFAULT_SHORTCUTS });
}

// Mientras se graba una combinación nueva en Ajustes,
// los atajos globales no actúan.
let recording = false;

export function setShortcutRecording(value: boolean) {
  recording = value;
}

export function isShortcutRecording() {
  return recording;
}

// ---------- Combinaciones ----------

const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "AltGraph",
  "OS",
]);

// Convierte una pulsación en una combinación ("Mod+K").
// Devuelve null si solo se pulsó un modificador.
export function comboFromEvent(
  event: KeyboardEvent
): string | null {
  if (
    event.isComposing ||
    MODIFIER_KEYS.has(event.key)
  ) {
    return null;
  }

  // AltGr (Ctrl+Alt en Windows) sirve para escribir símbolos,
  // no para atajos.
  if (
    event.getModifierState &&
    event.getModifierState("AltGraph")
  ) {
    return null;
  }

  let key = event.key;

  // En macOS, Option + letra produce otro carácter:
  // se usa la tecla física.
  if (
    IS_MAC &&
    event.altKey &&
    /^Key[A-Z]$/.test(event.code)
  ) {
    key = event.code.slice(3);
  } else if (
    IS_MAC &&
    event.altKey &&
    /^Digit\d$/.test(event.code)
  ) {
    key = event.code.slice(5);
  }

  if (key === " ") {
    key = "Space";
  } else if (key === "+") {
    // Ctrl++ y Ctrl+= son la misma combinación (zoom).
    key = "=";
  } else if (key.length === 1) {
    key = key.toUpperCase();
  }

  const parts: string[] = [];

  if (IS_MAC ? event.metaKey : event.ctrlKey) {
    parts.push("Mod");
  }

  if (IS_MAC && event.ctrlKey) {
    parts.push("Ctrl");
  }

  if (event.altKey) {
    parts.push("Alt");
  }

  // Con símbolos y dígitos, Shift ya va incluido en el carácter
  // ("?" o "!"), así que no se anota aparte.
  if (
    event.shiftKey &&
    (/^[A-Z]$/.test(key) || key.length > 1)
  ) {
    parts.push("Shift");
  }

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

// ¿Lleva modificador (o es una tecla de función)?
// Las que no, solo actúan cuando no se está escribiendo.
export function comboHasModifier(combo: string): boolean {
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  const modifiers = parts
    .slice(0, -1)
    .filter((part) => part !== "Shift");

  return modifiers.length > 0 || /^F\d{1,2}$/.test(key);
}

// Combinaciones que ya hacen algo en la app o en el sistema
// y no se pueden reasignar.
const RESERVED = new Set([
  "Mod+C",
  "Mod+V",
  "Mod+X",
  "Mod+A",
  "Mod+Z",
  "Mod+Y",
  "Mod+Shift+Z",
  "Mod+R",
  "Mod+Shift+R",
  "Mod+U",
  "Mod+Shift+I",
  "Mod+W",
  "Mod+P",
  "F5",
  "F12",
  "Tab",
  "Shift+Tab",
  "Enter",
  "Escape",
  "Space",
  "Backspace",
  "Delete",
]);

export type ComboError =
  | { type: "reserved" }
  | { type: "needModifier" }
  | { type: "inUse"; action: ShortcutAction };

export function validateCombo(
  action: ShortcutAction,
  combo: string
): ComboError | null {
  if (RESERVED.has(combo)) {
    return { type: "reserved" };
  }

  const key = combo.split("+").pop() ?? "";

  if (
    !comboHasModifier(combo) &&
    key !== "?" &&
    key !== "/"
  ) {
    return { type: "needModifier" };
  }

  const other = SHORTCUT_ACTIONS.find(
    (otherAction) =>
      otherAction !== action &&
      bindings[otherAction] === combo
  );

  if (other) {
    return { type: "inUse", action: other };
  }

  return null;
}
