import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

// Tipos
type Theme = "light" | "dark" | "system";
type Language = "es" | "en" | "fr" | "de";
type AutoLock = "never" | "15s" | "30s" | "1m" | "2m" | "5m";
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

const AUTO_LOCK_LABELS: Record<AutoLock, string> = {
  never: "Nunca",
  "15s": "15 segundos",
  "30s": "30 segundos",
  "1m": "1 minuto",
  "2m": "2 minutos",
  "5m": "5 minutos",
};

const DELETE_CONFIRM_PHRASE = "ELIMINAR TODO";

interface SettingsViewProps {
  onVaultDeleted: () => void;
}

// Componente principal
export function SettingsView({ onVaultDeleted }: SettingsViewProps) {
  // Estados
  const [theme, setTheme] = useState<Theme>("system");
  const [language, setLanguage] = useState<Language>("es");
  const [autoLock, setAutoLock] = useState<AutoLock>("never");
  const [lockOnMinimize, setLockOnMinimize] = useState(false);
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Estado del borrado de datos
  const [deleteStep, setDeleteStep] = useState<DeleteStep>("confirm");
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  // Funciones
  const handleThemeChange = (value: Theme | null) => {
    if (!value) return;
    setTheme(value);
    const root = document.documentElement;
    if (value === "dark") {
      root.classList.add("dark");
    } else if (value === "light") {
      root.classList.remove("dark");
    } else {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (isDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
    toast.success(`Tema cambiado a ${THEME_LABELS[value]}`);
  };

  const handleLanguageChange = (value: Language | null) => {
    if (!value) return;
    setLanguage(value);
    toast.success(`Idioma cambiado a ${LANGUAGE_LABELS[value]}`);
  };

  const handleAutoLockChange = (value: AutoLock | null) => {
    if (!value) return;
    setAutoLock(value);
    toast.success(`Auto-bloqueo configurado: ${AUTO_LOCK_LABELS[value]}`);
  };

  const handleExport = async () => {
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const data = {
        vault: { entries: [] },
        settings: { theme, language, autoLock, lockOnMinimize, startWithWindows, minimizeToTray, autoUpdate },
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
      await new Promise(resolve => setTimeout(resolve, 1500));
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
            <p className="text-sm text-muted-foreground">
              Configura Sailock a tu gusto.
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Sailock Versión</p>
            <p className="text-sm font-medium">0.1.0</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6 space-y-4 mt-4 px-2">
        {/* Tema */}
        <Card className="p-5 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                Tema
              </CardTitle>
              <CardDescription className="text-sm">
                Elige la apariencia de la aplicación.
              </CardDescription>
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

        {/* Idioma */}
        <Card className="p-5 rounded-xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Idioma
              </CardTitle>
              <CardDescription className="text-sm">
                Selecciona el idioma de la interfaz.
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

        {/* Seguridad - 2FA */}
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBackupCodes(!showBackupCodes)}
                >
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
                  <p className="text-xs text-muted-foreground">Códigos de verificación en tiempo real</p>
                </div>
                <Button variant="outline" size="sm">
                  <Smartphone className="h-4 w-4 mr-2" />
                  Configurar
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Auto-bloqueo - Mejorado */}
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
                <Select value={autoLock} onValueChange={handleAutoLockChange}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(AUTO_LOCK_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key as AutoLock}>
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
                <Switch checked={lockOnMinimize} onCheckedChange={setLockOnMinimize} />
              </div>
            </div>
          </div>
        </Card>

        {/* Sistema */}
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
                  <p className="text-xs text-muted-foreground">Inicia Sailock automáticamente al encender el PC</p>
                </div>
                <Switch checked={startWithWindows} onCheckedChange={setStartWithWindows} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Minimizar a la bandeja</p>
                  <p className="text-xs text-muted-foreground">Sailock se minimiza a la bandeja en lugar de cerrarse</p>
                </div>
                <Switch checked={minimizeToTray} onCheckedChange={setMinimizeToTray} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Actualizaciones automáticas</p>
                  <p className="text-xs text-muted-foreground">Sailock buscará actualizaciones al iniciar</p>
                </div>
                <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
              </div>
            </div>
          </div>
        </Card>

        {/* Importar / Exportar - Estilo Seguridad */}
        <Card className="p-5 rounded-xl">
          <div>
            <CardTitle className="text-base flex items-center gap-2 mb-1">
              <Download className="h-4 w-4 text-muted-foreground" />
              Importar / Exportar datos
            </CardTitle>
            <CardDescription className="text-sm mb-4">
              Exporta una copia de seguridad o restaura tus datos desde un archivo.
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

        {/* Borrar todos los datos */}
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
                    <p className="font-medium text-destructive mt-2">
                      Esta acción no se puede deshacer.
                    </p>
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
                    <p className="text-sm text-muted-foreground">
                      Eliminando todos los datos...
                    </p>
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