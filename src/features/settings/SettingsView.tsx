import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Moon,
  Sun,
  Monitor,
  Globe,
  Download,
  Upload,
  Trash2,
  Shield,
  AlertTriangle,
  Smartphone,
  Power,
  Eye,
  EyeOff,
  Lock,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useActivity } from "@/hooks/useActivity";
import { getStoredTheme, storeTheme, applyTheme, Theme } from "@/lib/theme";
import { AutoLockDuration, getStoredBool, storeBool } from "@/lib/appSettings";

type Language = "es" | "en" | "fr" | "de";
type DeleteStep = "confirm" | "password" | "confirmType" | "deleting";

const THEME_ICONS: Record<Theme, React.ReactNode> = {
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
  system: <Monitor className="h-4 w-4" />,
};

const THEME_LABELS: Record<Theme, string> = {
  light: "Claro",
  dark: "Oscuro",
  system: "Sistema",
};

const LANGUAGE_LABELS: Record<Language, string> = {
  es: "Español",
  en: "English",
  fr: "Français",
  de: "Deutsch",
};

const AUTO_LOCK_LABELS: Record<AutoLockDuration, string> = {
  never: "Nunca",
  "15s": "15 segundos",
  "30s": "30 segundos",
  "1m": "1 minuto",
  "2m": "2 minutos",
  "5m": "5 minutos",
};

const DELETE_CONFIRM_PHRASE = "ELIMINAR TODO";

function TotpSetupDialog({ onEnabled }: { onEnabled: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"loading" | "scan" | "verifying">("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const { saveActivity } = useActivity();

  const startSetup = async () => {
    setOpen(true);
    setStep("loading");
    setError("");
    setCode("");
    try {
      const qrBase64 = await invoke<string>("totp_begin_setup");
      setQr(qrBase64);
      setStep("scan");
    } catch (e) {
      setError(String(e));
      setStep("scan");
    }
  };

  const confirm = async () => {
    setStep("verifying");
    setError("");
    try {
      const ok = await invoke<boolean>("totp_confirm_setup", { code });
      if (ok) {
        toast.success("Verificación en dos pasos activada");
        saveActivity("edit", "Verificación en dos pasos (2FA) activada", "settings");
        setOpen(false);
        onEnabled();
      } else {
        setError("Código incorrecto, inténtalo de nuevo");
        setStep("scan");
      }
    } catch (e) {
      setError(String(e));
      setStep("scan");
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={startSetup}>
        <Smartphone className="h-4 w-4 mr-2" />
        Configurar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configurar verificación en dos pasos</DialogTitle>
            <DialogDescription>
              Escanea este código con Google Authenticator, Authy o tu app de autenticación preferida.
            </DialogDescription>
          </DialogHeader>
          {step === "loading" && (
            <p className="text-sm text-muted-foreground py-6 text-center">Generando código...</p>
          )}
          {(step === "scan" || step === "verifying") && qr && (
            <div className="flex flex-col gap-3 items-center">
              <img src={`data:image/png;base64,${qr}`} alt="Código QR" className="w-48 h-48" />
              <div className="w-full">
                <Label>Código de la app</Label>
                <Input
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirm()}
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={confirm} disabled={step === "verifying" || code.length < 6}>
                {step === "verifying" ? "Verificando..." : "Confirmar"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExportDialog() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const { saveActivity } = useActivity();

  const handleExport = async () => {
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setError("");
    setExporting(true);
    try {
      const content = await invoke<string>("export_vault", { exportPassword: password });
      const blob = new Blob([content], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sailock_backup_${new Date().toISOString().slice(0, 10)}.slock`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      saveActivity("download", "Vault exportado con contraseña propia", "settings");
      toast.success("Vault exportado correctamente");
      setOpen(false);
      setPassword("");
      setConfirmPassword("");
    } catch (e) {
      setError(String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4 mr-2" /> Exportar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Exportar datos</DialogTitle>
            <DialogDescription>
              Elige una contraseña solo para este archivo — no tiene por qué ser tu contraseña maestra. Sin ella, nadie puede abrir el archivo exportado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>Contraseña del archivo</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label>Repite la contraseña</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleExport()}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? "Exportando..." : "Exportar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ImportMode = "add_duplicates" | "skip_duplicates" | "replace_all";
type ImportStep = "form" | "confirm" | "totp" | "importing";

function ImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ImportStep>("form");
  const [file, setFile] = useState<File | null>(null);
  const [exportPassword, setExportPassword] = useState("");
  const [mode, setMode] = useState<ImportMode>("add_duplicates");
  const [confirmText, setConfirmText] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { saveActivity } = useActivity();

  const modeLabels: Record<ImportMode, string> = {
    add_duplicates: "Añadir todo (puede duplicar)",
    skip_duplicates: "Añadir, omitiendo duplicados por nombre",
    replace_all: "Reemplazar todo el vault",
  };

  const reset = () => {
    setStep("form");
    setFile(null);
    setExportPassword("");
    setMode("add_duplicates");
    setConfirmText("");
    setTotpCode("");
    setError("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) reset();
  };

  const goToConfirm = () => {
    if (!file) {
      setError("Selecciona un archivo");
      return;
    }
    if (!exportPassword) {
      setError("Introduce la contraseña de ese archivo");
      return;
    }
    setError("");
    setStep("confirm");
  };

  const proceedFromConfirm = async () => {
    if (mode === "replace_all" && confirmText.trim().toUpperCase() !== "REEMPLAZAR") {
      setError('Escribe "REEMPLAZAR" para confirmar');
      return;
    }
    setError("");
    const totpEnabled = await invoke<boolean>("totp_status").catch(() => false);
    if (totpEnabled) {
      setStep("totp");
    } else {
      await doImport();
    }
  };

  const verifyTotpAndImport = async () => {
    setError("");
    try {
      const ok = await invoke<boolean>("totp_verify_unlock", { code: totpCode });
      if (!ok) {
        setError("Código incorrecto");
        return;
      }
      await doImport();
    } catch (e) {
      setError(String(e));
    }
  };

  const doImport = async () => {
    if (!file) return;
    setStep("importing");
    setError("");
    try {
      const content = await file.text();
      const count = await invoke<number>("import_vault", {
        fileContent: content,
        exportPassword,
        mode,
      });
      toast.success(`${count} elementos importados`);
      saveActivity("create", `Importados ${count} elementos desde ${file.name} (modo: ${modeLabels[mode]})`, "settings");
      handleOpenChange(false);
      onImported();
    } catch (e) {
      setError(String(e));
      setStep("confirm");
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-2" /> Importar
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Importar datos</DialogTitle>
            <DialogDescription>
              {step === "form" && "Elige el archivo y la contraseña con la que se exportó."}
              {step === "confirm" && "Revisa lo que va a pasar antes de continuar."}
              {step === "totp" && "Introduce el código de tu app de autenticación."}
              {step === "importing" && "Importando..."}
            </DialogDescription>
          </DialogHeader>

          {step === "form" && (
            <div className="flex flex-col gap-3">
              <div>
                <Label>Archivo .slock</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Elegir archivo
                  </Button>
                  {file ? (
                    <span className="text-sm flex items-center gap-1 min-w-0">
                      <span className="truncate">{file.name}</span>
                      <button onClick={() => setFile(null)} title="Quitar archivo">
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Ningún archivo seleccionado</span>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".slock,.json"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div>
                <Label>Contraseña de ese archivo</Label>
                <Input
                  type="password"
                  placeholder="La contraseña que se eligió al exportarlo"
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  No es tu contraseña maestra — es la contraseña específica que se creó al exportar ese archivo.
                </p>
              </div>
              <div>
                <Label>Qué hacer con las entradas</Label>
                <Select value={mode} onValueChange={(v) => v && setMode(v as ImportMode)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add_duplicates">{modeLabels.add_duplicates}</SelectItem>
                    <SelectItem value="skip_duplicates">{modeLabels.skip_duplicates}</SelectItem>
                    <SelectItem value="replace_all">{modeLabels.replace_all}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={goToConfirm}>Continuar</Button>
            </div>
          )}

          {step === "confirm" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                Modo elegido: <span className="font-medium">{modeLabels[mode]}</span>
              </p>
              {mode === "replace_all" ? (
                <>
                  <p className="text-sm text-destructive">
                    Esto borrará permanentemente todas las entradas que tengas ahora mismo en este vault, y las sustituirá por las del archivo importado.
                  </p>
                  <div>
                    <Label>Escribe "REEMPLAZAR" para confirmar</Label>
                    <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="REEMPLAZAR" />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Las entradas del archivo se añadirán a tu vault actual.</p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button onClick={proceedFromConfirm}>Confirmar</Button>
                <Button variant="ghost" onClick={() => setStep("form")}>
                  Atrás
                </Button>
              </div>
            </div>
          )}

          {step === "totp" && (
            <div className="flex flex-col gap-3">
              <Input
                placeholder="123456"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyTotpAndImport()}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={verifyTotpAndImport}>Verificar e importar</Button>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-6">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mb-3" />
              <p className="text-sm text-muted-foreground">Importando...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SettingsViewProps {
  onVaultDeleted: () => void;
  autoLockDuration: AutoLockDuration;
  onAutoLockDurationChange: (value: AutoLockDuration) => void;
  lockOnMinimize: boolean;
  onLockOnMinimizeChange: (value: boolean) => void;
}

export function SettingsView({
  onVaultDeleted,
  autoLockDuration,
  onAutoLockDurationChange,
  lockOnMinimize,
  onLockOnMinimizeChange,
}: SettingsViewProps) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme());
  const [language, setLanguage] = useState<Language>("es");
  const [startWithWindows, setStartWithWindows] = useState(() => getStoredBool("startWithWindows", false));
  const [minimizeToTray, setMinimizeToTray] = useState(() => getStoredBool("minimizeToTray", false));
  const [autoUpdate, setAutoUpdate] = useState(() => getStoredBool("autoUpdate", true));
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const { saveActivity } = useActivity();

  const [deleteStep, setDeleteStep] = useState<DeleteStep>("confirm");
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  useEffect(() => {
    invoke<boolean>("totp_status")
      .then(setTotpEnabled)
      .catch(() => {});
  }, []);

  const handleDisableTotp = async () => {
    await invoke("totp_disable");
    setTotpEnabled(false);
    saveActivity("edit", "Verificación en dos pasos (2FA) desactivada", "settings");
    toast.success("Verificación en dos pasos desactivada");
  };

  const handleThemeChange = (value: Theme | null) => {
    if (!value) return;
    setTheme(value);
    applyTheme(value);
    storeTheme(value);
    saveActivity("edit", `Tema cambiado a ${THEME_LABELS[value]}`, "settings");
    toast.success(`Tema cambiado a ${THEME_LABELS[value]}`);
  };

  const handleLanguageChange = (value: Language | null) => {
    if (!value) return;
    setLanguage(value);
    saveActivity("edit", `Idioma cambiado a ${LANGUAGE_LABELS[value]}`, "settings");
    toast.success(`Idioma cambiado a ${LANGUAGE_LABELS[value]}`);
  };

  const handleAutoLockChange = (value: AutoLockDuration | null) => {
    if (!value) return;
    onAutoLockDurationChange(value);
    saveActivity("edit", `Auto-bloqueo configurado: ${AUTO_LOCK_LABELS[value]}`, "settings");
    toast.success(`Auto-bloqueo configurado: ${AUTO_LOCK_LABELS[value]}`);
  };

  const handleLockOnMinimizeChange = (value: boolean) => {
    onLockOnMinimizeChange(value);
    saveActivity("edit", `Bloquear al minimizar: ${value ? "activado" : "desactivado"}`, "settings");
  };

  const handleStartWithWindowsChange = (value: boolean) => {
    setStartWithWindows(value);
    storeBool("startWithWindows", value);
    saveActivity("edit", `Iniciar con Windows: ${value ? "activado" : "desactivado"}`, "settings");
  };

  const handleMinimizeToTrayChange = (value: boolean) => {
    setMinimizeToTray(value);
    storeBool("minimizeToTray", value);
    saveActivity("edit", `Minimizar a la bandeja: ${value ? "activado" : "desactivado"}`, "settings");
  };

  const handleAutoUpdateChange = (value: boolean) => {
    setAutoUpdate(value);
    storeBool("autoUpdate", value);
    saveActivity("edit", `Actualizaciones automáticas: ${value ? "activado" : "desactivado"}`, "settings");
  };

  const resetDeleteDialog = () => {
    setDeleteStep("confirm");
    setMasterPassword("");
    setConfirmText("");
    setDeleteError("");
  };

  const handleContinueFromConfirm = () => {
    setDeleteError("");
    setDeleteStep("password");
  };

  const handleVerifyPassword = async () => {
    if (!masterPassword) {
      setDeleteError("Introduce tu contraseña maestra");
      return;
    }
    setDeleteError("");
    setVerifyingPassword(true);
    try {
      const ok = await invoke<boolean>("verify_master_password", { masterPassword });
      if (!ok) {
        setDeleteError("Contraseña maestra incorrecta");
        return;
      }
      setDeleteStep("confirmType");
    } catch (e) {
      setDeleteError(String(e));
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleFinalDelete = async () => {
    if (confirmText.trim().toUpperCase() !== DELETE_CONFIRM_PHRASE) {
      setDeleteError(`Escribe exactamente "${DELETE_CONFIRM_PHRASE}" para confirmar`);
      return;
    }
    setDeleteError("");
    setDeleteStep("deleting");
    try {
      await invoke("delete_vault", { masterPassword });
      toast.success("Todos los datos han sido eliminados");
      resetDeleteDialog();
      onVaultDeleted();
    } catch (e) {
      setDeleteError(String(e));
      setDeleteStep("confirmType");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-1">Ajustes</h2>
            <p className="text-sm text-muted-foreground">Configura Sailock a tu gusto.</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Sailock Versión</p>
            <p className="text-sm font-medium">0.1.0</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6 space-y-4 mt-4 px-2">
        <Card className="p-5 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                Tema
              </CardTitle>
              <CardDescription className="text-sm">Elige la apariencia de la aplicación.</CardDescription>
            </div>
            <Select value={theme} onValueChange={handleThemeChange}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(THEME_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key as Theme}>
                    <div className="flex items-center gap-2">
                      {THEME_ICONS[key as Theme]}
                      {label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-5 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Idioma
              </CardTitle>
              <CardDescription className="text-sm">
                Selecciona el idioma de la interfaz. (De momento solo guarda tu preferencia — la traducción completa la montamos aparte.)
              </CardDescription>
            </div>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key as Language}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="p-5 rounded-xl">
          <div>
            <CardTitle className="text-base flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Seguridad
            </CardTitle>
            <CardDescription className="text-sm mb-4">
              Configura la autenticación de dos factores y otras opciones de seguridad.
            </CardDescription>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Códigos de respaldo</p>
                  <p className="text-xs text-muted-foreground">Códigos de un solo uso para recuperar tu cuenta</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowBackupCodes(!showBackupCodes)}>
                  {showBackupCodes ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  {showBackupCodes ? "Ocultar" : "Ver códigos"}
                </Button>
              </div>
              {showBackupCodes && (
                <div className="bg-muted p-3 rounded-md font-mono text-sm grid grid-cols-2 gap-1">
                  {Array.from({ length: 10 }, (_, i) => (
                    <span key={i}>XXXX-XXXX-XXXX</span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="text-sm font-medium">Autenticador (TOTP)</p>
                  <p className="text-xs text-muted-foreground">
                    {totpEnabled
                      ? "Activado — se pedirá un código al desbloquear"
                      : "Pide un código de tu móvil además de la contraseña maestra"}
                  </p>
                </div>
                {totpEnabled ? (
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      Desactivar
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Desactivar la verificación en dos pasos?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Volverás a poder desbloquear Sailock solo con tu contraseña maestra.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDisableTotp}>Desactivar</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <TotpSetupDialog onEnabled={() => setTotpEnabled(true)} />
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-xl">
          <div>
            <CardTitle className="text-base flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Auto-bloqueo
            </CardTitle>
            <CardDescription className="text-sm mb-4">
              Bloquea automáticamente la sesión tras un periodo de inactividad.
            </CardDescription>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Tiempo de inactividad</p>
                  <p className="text-xs text-muted-foreground">Tiempo de espera antes de bloquear la sesión</p>
                </div>
                <Select value={autoLockDuration} onValueChange={handleAutoLockChange}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AUTO_LOCK_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key as AutoLockDuration}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="text-sm font-medium">Bloquear al minimizar</p>
                  <p className="text-xs text-muted-foreground">Bloquea la sesión cuando la ventana se minimiza</p>
                </div>
                <Switch checked={lockOnMinimize} onCheckedChange={handleLockOnMinimizeChange} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-xl">
          <div>
            <CardTitle className="text-base flex items-center gap-2 mb-3">
              <Power className="h-4 w-4 text-muted-foreground" />
              Sistema
            </CardTitle>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Iniciar con Windows</p>
                  <p className="text-xs text-muted-foreground">
                    Guarda la preferencia; falta la integración real con Windows
                  </p>
                </div>
                <Switch checked={startWithWindows} onCheckedChange={handleStartWithWindowsChange} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Minimizar a la bandeja</p>
                  <p className="text-xs text-muted-foreground">
                    Guarda la preferencia; falta la integración real
                  </p>
                </div>
                <Switch checked={minimizeToTray} onCheckedChange={handleMinimizeToTrayChange} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Actualizaciones automáticas</p>
                  <p className="text-xs text-muted-foreground">Sailock buscará actualizaciones al iniciar</p>
                </div>
                <Switch checked={autoUpdate} onCheckedChange={handleAutoUpdateChange} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-xl">
          <div>
            <CardTitle className="text-base flex items-center gap-2 mb-1">
              <Download className="h-4 w-4 text-muted-foreground" />
              Importar / Exportar datos
            </CardTitle>
            <CardDescription className="text-sm mb-4">
              Exporta una copia cifrada de tu vault, o añade datos desde un archivo exportado antes.
            </CardDescription>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Exportar datos</p>
                  <p className="text-xs text-muted-foreground">Crea un archivo cifrado con una contraseña que tú eliges</p>
                </div>
                <ExportDialog />
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="text-sm font-medium">Importar datos</p>
                  <p className="text-xs text-muted-foreground">Añade o reemplaza entradas desde un archivo .slock</p>
                </div>
                <ImportDialog onImported={() => {}} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-destructive/50 p-5 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Borrar todos los datos
              </CardTitle>
              <CardDescription className="text-sm text-destructive/70">
                Elimina permanentemente todos tus datos. No se puede deshacer.
              </CardDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                <Trash2 className="h-4 w-4 mr-2" />
                Borrar datos
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    ¿Estás segura?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>Esta acción eliminará permanentemente todos tus datos:</p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li>Todas las entradas del Vault</li>
                      <li>Historial de auditoría</li>
                      <li>Códigos de respaldo guardados</li>
                    </ul>
                    <p className="font-medium text-destructive mt-2">Esta acción no se puede deshacer.</p>
                  </AlertDialogDescription>
                </AlertDialogHeader>

                {deleteStep === "confirm" && (
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={resetDeleteDialog}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleContinueFromConfirm} className="bg-destructive hover:bg-destructive/90">
                      Continuar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                )}

                {deleteStep === "password" && (
                  <>
                    <div className="space-y-3">
                      <Label>Contraseña maestra</Label>
                      <Input
                        type="password"
                        placeholder="Introduce tu contraseña maestra"
                        value={masterPassword}
                        onChange={(e) => setMasterPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleVerifyPassword()}
                        autoFocus
                      />
                      {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={resetDeleteDialog}>Cancelar</AlertDialogCancel>
                      <Button
                        onClick={handleVerifyPassword}
                        disabled={verifyingPassword}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        {verifyingPassword ? "Verificando..." : "Verificar"}
                      </Button>
                    </AlertDialogFooter>
                  </>
                )}

                {deleteStep === "confirmType" && (
                  <>
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Para confirmar, escribe <span className="font-mono font-semibold text-foreground">{DELETE_CONFIRM_PHRASE}</span> en el campo de abajo.
                      </p>
                      <Label>Confirmación</Label>
                      <Input
                        placeholder={DELETE_CONFIRM_PHRASE}
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleFinalDelete()}
                        autoFocus
                      />
                      {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={resetDeleteDialog}>Cancelar</AlertDialogCancel>
                      <Button
                        onClick={handleFinalDelete}
                        disabled={confirmText.trim().toUpperCase() !== DELETE_CONFIRM_PHRASE}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        Eliminar para siempre
                      </Button>
                    </AlertDialogFooter>
                  </>
                )}

                {deleteStep === "deleting" && (
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-destructive border-t-transparent mb-4" />
                    <p className="text-sm text-muted-foreground">Eliminando todos los datos...</p>
                  </div>
                )}
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>
      </div>
    </div>
  );
}