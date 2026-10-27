// src/hooks/useScheduledBackup.ts
// Crea las copias automáticas: al desbloquear el vault y después cada pocos minutos mientras la app siga abierta.
// Solo funciona con la app abierta y desbloqueada, porque la contraseña de las copias está cifrada con la clave del vault.
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import i18n from "@/i18n";
import { BackupConfig, backupFileName, collectSettings, isBackupDue } from "@/lib/backupSettings";
import { recordBackup } from "@/lib/notifications";
import { alertEvent } from "@/lib/securityAlerts";

const RECHECK_MS = 15 * 60 * 1000;
export const BACKUP_DONE_EVENT = "sailock:backup-done";

// Crea una copia con la configuración guardada. La usan el programador y el botón "Crear copia ahora".
export async function runBackupNow(config: BackupConfig): Promise<string> {
  const path = await invoke<string>("run_backup_now", {
    fileName: backupFileName({ prefix: config.prefix, dateFormat: config.date_format }),
    settings: config.sections.includes("settings") ? collectSettings() : null,
  });
  recordBackup();
  window.dispatchEvent(new Event(BACKUP_DONE_EVENT));
  return path;
}

export function useScheduledBackup(unlocked: boolean) {
  const running = useRef(false);
  const failedOnce = useRef(false);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;

    const check = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const config = await invoke<BackupConfig>("get_backup_config");
        if (cancelled || !isBackupDue(config)) return;
        await runBackupNow(config);
        failedOnce.current = false;
      } catch (e) {
        // Se avisa una sola vez por sesión para no molestar si la carpeta no está disponible.
        if (!failedOnce.current) {
          failedOnce.current = true;
          alertEvent("alert_backup_failed");
          toast.error(i18n.t("settings:autoBackupFailed", { error: String(e) }));
        }
      } finally {
        running.current = false;
      }
    };

    check();
    const timer = setInterval(check, RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [unlocked]);
}