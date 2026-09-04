import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useLockOnMinimize(enabled: boolean, onLock: () => void) {
  useEffect(() => {
    if (!enabled) return;

    let unlisten: (() => void) | undefined;
    const appWindow = getCurrentWindow();

    appWindow.onResized(async () => {
      const minimized = await appWindow.isMinimized();
      if (minimized) onLock();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [enabled, onLock]);
}