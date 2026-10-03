import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { dismissUpdate, installUpdate, runAutomaticCheckOnce, useUpdater } from "@/hooks/useUpdater";

// Diálogo "Actualización disponible". Se abre cuando hay una versión nueva, ya sea por la
// comprobación automática o por el botón "Buscar actualizaciones" de Ajustes.
export function UpdateDialog() {
  const { t } = useTranslation("settings");
  const { status, version, currentVersion, progress, dialogOpen } = useUpdater();
  const downloading = status === "downloading";

  const handleInstall = async () => {
    const ok = await installUpdate();
    if (!ok) toast.error(t("updateInstallErrorToast"));
  };

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open && !downloading) dismissUpdate();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("updateAvailableTitle")}</DialogTitle>
          <DialogDescription>
            {t("updateAvailableDescription", { version, current: currentVersion })}
          </DialogDescription>
        </DialogHeader>

        {downloading && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {t("updateDownloadingLabel")} {progress ?? 0}%
            </p>
            <div
              className="h-2 w-full rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress ?? 0}
            >
              <div className="h-full bg-primary transition-all" style={{ width: `${progress ?? 0}%` }} />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={dismissUpdate} disabled={downloading}>
            {t("updateLaterButton")}
          </Button>
          <Button onClick={handleInstall} disabled={downloading}>
            {t("updateNowButton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Se monta una sola vez en la app (con la bóveda desbloqueada). Si el ajuste está activado,
// comprueba si hay versión nueva poco después de abrir la app y muestra el diálogo.
// Con el ajuste desactivado nunca se conecta por su cuenta.
export function UpdateChecker({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      void runAutomaticCheckOnce();
    }, 3000);
    return () => clearTimeout(timer);
  }, [enabled]);

  return <UpdateDialog />;
}
