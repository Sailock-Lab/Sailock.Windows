// src/components/MasterPasswordDialog.tsx
// Pide la contraseña maestra, la comprueba en el backend y llama a `onVerified` con ella.
// Se usa para mostrar contenido protegido (notas, códigos TOTP) o quitarle la protección.
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MasterPasswordDialog({
  open,
  onOpenChange,
  onVerified,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: (masterPassword: string) => Promise<void> | void;
  title?: string;
  description?: string;
}) {
  const { t } = useTranslation("vault");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword("");
      setError("");
      setBusy(false);
    }
  }, [open]);

  const confirm = async () => {
    if (!password) {
      setError(t("revealPasswordRequiredError"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ok = await invoke<boolean>("verify_master_password", { masterPassword: password });
      if (!ok) {
        setError(t("revealWrongPasswordError"));
        setBusy(false);
        return;
      }
      await onVerified(password);
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title ?? t("masterPasswordDialogTitle")}</DialogTitle>
          <DialogDescription>{description ?? t("masterPasswordDialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            type="password"
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={confirm} disabled={busy}>
            {busy ? t("revealVerifyingButton") : t("revealConfirmButton")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}