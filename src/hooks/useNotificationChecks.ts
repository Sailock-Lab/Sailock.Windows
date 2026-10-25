// src/hooks/useNotificationChecks.ts
// Carga los avisos al desbloquear y repite las comprobaciones cada pocas horas mientras la app sigue abierta.
import { useEffect, useRef } from "react";
import { refreshNotifications, resetNotifications } from "@/lib/notifications";
import { runNotificationChecks } from "@/lib/notificationChecks";

const RECHECK_MS = 6 * 60 * 60 * 1000;

export function useNotificationChecks(unlocked: boolean, checkUpdates: boolean) {
  const latestCheckUpdates = useRef(checkUpdates);
  latestCheckUpdates.current = checkUpdates;

  useEffect(() => {
    if (!unlocked) {
      resetNotifications();
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        await refreshNotifications();
        if (!cancelled) await runNotificationChecks(latestCheckUpdates.current);
      } catch {
        // los avisos nunca deben molestar: si algo falla, simplemente no se muestran
      }
    };
    run();
    const timer = setInterval(run, RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [unlocked]);
}