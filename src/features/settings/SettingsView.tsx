import { useState, useEffect } from "react";
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
  const [isLoading, setIsLoading] = useState(false);
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

  const handleExport = async () => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const data = {
        vault: { entries: [] },
        settings: { theme, language, autoLockDuration, lockOnMinimize, startWithWindows, minimizeToTray, autoUpdate },
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sailock_backup_${new Date().toISOString().slice(0, 10)}.slock`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      saveActivity("download", "Copia de seguridad exportada (aún no incluye el vault real)", "settings");
      toast.success("Datos exportados correctamente");
    } catch (error) {
      toast.error("Error al exportar los datos");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.vault || !data.settings) {
        throw new Error("Formato de archivo inválido");
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      saveActivity("edit", "Datos importados desde archivo (aún no aplica al vault real)", "settings");
      toast.success("Datos importados correctamente");
    } catch (error) {
      toast.error("Error al importar los datos: " + (error as Error).message);
    } finally {
      setIsLoading(false);
      event.target.value = "";
    }
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
              Exporta una copia de seguridad o restaura tus datos desde un archivo. (Aún no incluye el vault real.)
            </CardDescription>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Exportar datos</p>
                  <p className="text-xs text-muted-foreground">Crea un archivo de copia de seguridad (.slock)</p>
                </div>
                <Button variant="outline" onClick={handleExport} disabled={isLoading} size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="text-sm font-medium">Importar datos</p>
                  <p className="text-xs text-muted-foreground">Restaura tus datos desde un archivo .slock</p>
                </div>
                <div className="relative">
                  <Button variant="outline" disabled={isLoading} size="sm" className="relative">
                    <Upload className="h-4 w-4 mr-2" />
                    Importar
                    <Input
                      type="file"
                      accept=".slock,.json"
                      onChange={handleImport}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </Button>
                </div>
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