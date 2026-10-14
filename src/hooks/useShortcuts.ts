import { useEffect, useRef } from "react";
import {
  SHORTCUT_ACTIONS,
  ShortcutAction,
  comboFromEvent,
  comboHasModifier,
  getShortcuts,
  isShortcutRecording,
} from "@/lib/shortcuts";

const BLOCKED_IN_MODAL = new Set<ShortcutAction>([
  "goVault",
  "goGenerator",
  "goActivity",
  "goSettings",
  "search",
  "newEntry",
  "help",
]);

export type ShortcutHandlers = Record<ShortcutAction, () => void>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useShortcuts(enabled: boolean, handlers: ShortcutHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || isShortcutRecording()) return;
      const combo = comboFromEvent(e);
      if (!combo) return;

      const bindings = getShortcuts();
      const action = SHORTCUT_ACTIONS.find((a) => bindings[a] && bindings[a] === combo);
      if (!action) return;

      if (!comboHasModifier(combo) && isTypingTarget(e.target)) return;
      const modalOpen = !!document.querySelector('[role="dialog"], [role="alertdialog"]');
      if (modalOpen && BLOCKED_IN_MODAL.has(action)) return;

      e.preventDefault();
      latest.current[action]();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}