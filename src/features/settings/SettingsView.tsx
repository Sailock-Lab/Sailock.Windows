import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Accessibility,
} from "lucide-react";
import { toast } from "sonner";
import { useActivity } from "@/hooks/useActivity";
import { getStoredTheme, storeTheme, applyTheme, Theme } from "@/lib/theme";
import { AutoLockDuration, TextSize, getStoredBool, storeBool } from "@/lib/appSettings";
import i18n from "@/i18n";
import { LANGUAGE_LABELS } from "@/i18n/languages";

type DeleteStep = "confirm" | "password" | "confirmType" | "deleting";

const THEME_ICONS: Record<Theme, React.ReactNode> = {
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
  system: <Monitor className="h-4 w-4" />,
};

function TotpSetupDialog({ onEnabled }: { onEnabled: () => void }) {
  const { t } = useTranslation("settings");
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
        toast.success(t("totpEnabledToast"));
        saveActivity("edit", "totpEnabled", "settings");
        setOpen(false);
        onEnabled();
      } else {
        setError(t("totpWrongCodeError"));
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
        {t("totpConfigureButton")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("totpSetupTitle")}</DialogTitle>
            <DialogDescription>{t("totpSetupDescription")}</DialogDescription>
          </DialogHeader>
          {step === "loading" && <p className="text-sm text-muted-foreground py-6 text-center">{t("totpGeneratingCode")}</p>}
          {(step === "scan" || step === "verifying") && qr && (
            <div className="flex flex-col gap-3 items-center">
              <img src={`data:image/png;base64,${qr}`} alt="QR" className="w-48 h-48" />
              <div className="w-full">
                <Label>{t("totpAppCodeLabel")}</Label>
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
                {step === "verifying" ? t("totpVerifyingButton") : t("totpConfirmButton")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExportDialog() {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const { saveActivity } = useActivity();

  const handleExport = async () => {
    if (password.length < 8) {
      setError(t("exportMinLengthError"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("exportMismatchError"));
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
      saveActivity("download", "vaultExported", "settings");
      toast.success(t("exportSuccessToast"));
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
        <Download className="h-4 w-4 mr-2" /> {t("exportButton")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("exportDialogTitle")}</DialogTitle>
            <DialogDescription>{t("exportDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div>
              <Label>{t("exportPasswordLabel")}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label>{t("exportConfirmPasswordLabel")}</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleExport()}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? t("exportingButton") : t("exportButtonAction")}
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
  const { t } = useTranslation("settings");
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
    add_duplicates: t("importModeAddDuplicates"),
    skip_duplicates: t("importModeSkipDuplicates"),
    replace_all: t("importModeReplaceAll"),
  };

  const replacePhrase = t("replaceConfirmPhrase");

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
      setError(t("selectFileError"));
      return;
    }
    if (!exportPassword) {
      setError(t("enterPasswordError"));
      return;
    }
    setError("");
    setStep("confirm");
  };

  const proceedFromConfirm = async () => {
    if (mode === "replace_all" && confirmText.trim().toUpperCase() !== replacePhrase) {
      setError(t("replaceConfirmError", { phrase: replacePhrase }));
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
        setError(t("wrongCodeError"));
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
      toast.success(t("importSuccessToast", { count }));
      saveActivity("create", "vaultImported", "settings", { count: String(count), filename: file.name, mode });
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
        <Upload className="h-4 w-4 mr-2" /> {t("importButton")}
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("importDialogTitle")}</DialogTitle>
            <DialogDescription>
              {step === "form" && t("importStepFormDescription")}
              {step === "confirm" && t("importStepConfirmDescription")}
              {step === "totp" && t("importStepTotpDescription")}
              {step === "importing" && t("importStepImportingDescription")}
            </DialogDescription>
          </DialogHeader>

          {step === "form" && (
            <div className="flex flex-col gap-3">
              <div>
                <Label>{t("importFileLabel")}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    {t("chooseFileButton")}
                  </Button>
                  {file ? (
                    <span className="text-sm flex items-center gap-1 min-w-0">
                      <span className="truncate">{file.name}</span>
                      <button onClick={() => setFile(null)} title={t("removeFileTooltip")}>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t("noFileSelected")}</span>
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
                <Label>{t("importPasswordLabel")}</Label>
                <Input
                  type="password"
                  placeholder={t("importPasswordPlaceholder")}
                  value={exportPassword}
                  onChange={(e) => setExportPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">{t("importPasswordHint")}</p>
              </div>
              <div>
                <Label>{t("importModeLabel")}</Label>
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
              <Button onClick={goToConfirm}>{t("continueButton")}</Button>
            </div>
          )}

          {step === "confirm" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                {t("modeChosenLabel")} <span className="font-medium">{modeLabels[mode]}</span>
              </p>
              {mode === "replace_all" ? (
                <>
                  <p className="text-sm text-destructive">{t("replaceWarning")}</p>
                  <div>
                    <Label>{t("replaceConfirmLabel", { phrase: replacePhrase })}</Label>
                    <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={replacePhrase} />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("addWillBeAddedNotice")}</p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button onClick={proceedFromConfirm}>{t("confirmButton")}</Button>
                <Button variant="ghost" onClick={() => setStep("form")}>
                  {t("backButton")}
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
              <Button onClick={verifyTotpAndImport}>{t("verifyAndImportButton")}</Button>
            </div>
          )}

          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-6">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mb-3" />
              <p className="text-sm text-muted-foreground">{t("importingLabel")}</p>
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
  reduceMotion: boolean;
  onReduceMotionChange: (value: boolean) => void;
  textSize: TextSize;
  onTextSizeChange: (value: TextSize) => void;
}

export function SettingsView({
  onVaultDeleted,
  autoLockDuration,
  onAutoLockDurationChange,
  lockOnMinimize,
  onLockOnMinimizeChange,
  reduceMotion,
  onReduceMotionChange,
  textSize,
  onTextSizeChange,
}: SettingsViewProps) {
  const { t } = useTranslation("settings");

  const THEME_LABELS: Record<Theme, string> = {
    light: t("themeLight"),
    dark: t("themeDark"),
    system: t("themeSystem"),
  };

  const AUTO_LOCK_LABELS: Record<AutoLockDuration, string> = {
    never: t("autoLockNever"),
    "15s": t("autoLock15s"),
    "30s": t("autoLock30s"),
    "1m": t("autoLock1m"),
    "2m": t("autoLock2m"),
    "5m": t("autoLock5m"),
  };

  const TEXT_SIZE_LABELS: Record<TextSize, string> = {
    small: t("textSizeSmall"),
    normal: t("textSizeNormal"),
    large: t("textSizeLarge"),
  };

  const DELETE_CONFIRM_PHRASE = t("deleteConfirmPhrase");

  const [theme, setTheme] = useState<Theme>(getStoredTheme());
  const [language, setLanguage] = useState(i18n.language);
  const [startWithWindows, setStartWithWindows] = useState(() => getStoredBool("startWithWindows", false));
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
    saveActivity("edit", "totpDisabled", "settings");
    toast.success(t("totpDisabledToast"));
  };

  const handleThemeChange = (value: Theme | null) => {
    if (!value) return;
    setTheme(value);
    applyTheme(value);
    storeTheme(value);
    saveActivity("edit", "themeChanged", "settings", { theme: value });
    toast.success(t("themeChangedToast", { theme: THEME_LABELS[value] }));
  };

  const handleLanguageChange = (value: string | null) => {
    if (!value) return;
    setLanguage(value);
    i18n.changeLanguage(value);
    saveActivity("edit", "languageChanged", "settings", { language: value });
    toast.success(`${LANGUAGE_LABELS[value]}`);
  };

  const handleAutoLockChange = (value: AutoLockDuration | null) => {
    if (!value) return;
    onAutoLockDurationChange(value);
    saveActivity("edit", "autoLockChanged", "settings", { duration: value });
    toast.success(t("autoLockChangedToast", { duration: AUTO_LOCK_LABELS[value] }));
  };

  const handleLockOnMinimizeChange = (value: boolean) => {
    onLockOnMinimizeChange(value);
    saveActivity("edit", "lockOnMinimizeToggled", "settings", { state: value ? "on" : "off" });
  };

  const handleStartWithWindowsChange = (value: boolean) => {
    setStartWithWindows(value);
    storeBool("startWithWindows", value);
    saveActivity("edit", "startWithWindowsToggled", "settings", { state: value ? "on" : "off" });
  };

  const handleReduceMotionChange = (value: boolean) => {
    onReduceMotionChange(value);
  };

  const handleTextSizeChange = (value: TextSize | null) => {
    if (!value) return;
    onTextSizeChange(value);
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
      setDeleteError(t("deleteEnterPasswordError"));
      return;
    }
    setDeleteError("");
    setVerifyingPassword(true);
    try {
      const ok = await invoke<boolean>("verify_master_password", { masterPassword });
      if (!ok) {
        setDeleteError(t("deleteWrongPasswordError"));
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
      setDeleteError(t("deleteWrongPhraseError", { phrase: DELETE_CONFIRM_PHRASE }));
      return;
    }
    setDeleteError("");
    setDeleteStep("deleting");
    try {
      await invoke("delete_vault", { masterPassword });
      toast.success(t("deleteSuccessToast"));
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
            <h2 className="text-2xl font-bold mb-1">{t("pageTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{t("versionLabel")}</p>
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
                {t("themeCardTitle")}
              </CardTitle>
              <CardDescription className="text-sm">{t("themeCardDescription")}</CardDescription>
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
                {t("languageCardTitle")}
              </CardTitle>
              <CardDescription className="text-sm">{t("languageCardDescription")}</CardDescription>
            </div>
            <Select value={language} onValueChange={handleLanguageChange}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
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
              {t("securityCardTitle")}
            </CardTitle>
            <CardDescription className="text-sm mb-4">{t("securityCardDescription")}</CardDescription>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("backupCodesLabel")}</p>
                  <p className="text-xs text-muted-foreground">{t("backupCodesDescription")}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowBackupCodes(!showBackupCodes)}>
                  {showBackupCodes ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                  {showBackupCodes ? t("hideCodesButton") : t("viewCodesButton")}
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
                  <p className="text-sm font-medium">{t("totpLabel")}</p>
                  <p className="text-xs text-muted-foreground">
                    {totpEnabled ? t("totpEnabledDescription") : t("totpDisabledDescription")}
                  </p>
                </div>
                {totpEnabled ? (
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
                      {t("totpDisableButton")}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("totpDisableConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("totpDisableConfirmDescription")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("totpDisableConfirmCancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDisableTotp}>{t("totpDisableConfirmAction")}</AlertDialogAction>
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
              {t("autoLockCardTitle")}
            </CardTitle>
            <CardDescription className="text-sm mb-4">{t("autoLockCardDescription")}</CardDescription>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("autoLockIntervalLabel")}</p>
                  <p className="text-xs text-muted-foreground">{t("autoLockIntervalDescription")}</p>
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
                  <p className="text-sm font-medium">{t("lockOnMinimizeLabel")}</p>
                  <p className="text-xs text-muted-foreground">{t("lockOnMinimizeDescription")}</p>
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
              {t("systemCardTitle")}
            </CardTitle>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("startWithWindowsLabel")}</p>
                  <p className="text-xs text-muted-foreground">{t("startWithWindowsDescription")}</p>
                </div>
                <Switch checked={startWithWindows} onCheckedChange={handleStartWithWindowsChange} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-xl">
          <div>
            <CardTitle className="text-base flex items-center gap-2 mb-1">
              <Accessibility className="h-4 w-4 text-muted-foreground" />
              {t("accessibilityCardTitle")}
            </CardTitle>
            <CardDescription className="text-sm mb-4">{t("accessibilityCardDescription")}</CardDescription>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("reduceMotionLabel")}</p>
                  <p className="text-xs text-muted-foreground">{t("reduceMotionDescription")}</p>
                </div>
                <Switch checked={reduceMotion} onCheckedChange={handleReduceMotionChange} />
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-sm font-medium">{t("textSizeLabel")}</p>
                <Select value={textSize} onValueChange={handleTextSizeChange}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TEXT_SIZE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key as TextSize}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5 rounded-xl">
          <div>
            <CardTitle className="text-base flex items-center gap-2 mb-1">
              <Download className="h-4 w-4 text-muted-foreground" />
              {t("importExportCardTitle")}
            </CardTitle>
            <CardDescription className="text-sm mb-4">{t("importExportCardDescription")}</CardDescription>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("exportDataLabel")}</p>
                  <p className="text-xs text-muted-foreground">{t("exportDataDescription")}</p>
                </div>
                <ExportDialog />
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <p className="text-sm font-medium">{t("importDataLabel")}</p>
                  <p className="text-xs text-muted-foreground">{t("importDataDescription")}</p>
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
                {t("deleteCardTitle")}
              </CardTitle>
              <CardDescription className="text-sm text-destructive/70">{t("deleteCardDescription")}</CardDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t("deleteButton")}
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    {t("deleteConfirmAreYouSure")}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>{t("deleteConfirmIntro")}</p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li>{t("deleteConfirmVaultItem")}</li>
                      <li>{t("deleteConfirmAuditItem")}</li>
                      <li>{t("deleteConfirmCodesItem")}</li>
                    </ul>
                    <p className="font-medium text-destructive mt-2">{t("deleteConfirmCannotUndo")}</p>
                  </AlertDialogDescription>
                </AlertDialogHeader>

                {deleteStep === "confirm" && (
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={resetDeleteDialog}>{t("deleteCancelButton")}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleContinueFromConfirm} className="bg-destructive hover:bg-destructive/90">
                      {t("deleteContinueButton")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                )}

                {deleteStep === "password" && (
                  <>
                    <div className="space-y-3">
                      <Label>{t("deleteMasterPasswordLabel")}</Label>
                      <Input
                        type="password"
                        placeholder={t("deleteMasterPasswordPlaceholder")}
                        value={masterPassword}
                        onChange={(e) => setMasterPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleVerifyPassword()}
                        autoFocus
                      />
                      {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={resetDeleteDialog}>{t("deleteCancelButton")}</AlertDialogCancel>
                      <Button
                        onClick={handleVerifyPassword}
                        disabled={verifyingPassword}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        {verifyingPassword ? t("deleteVerifyingButton") : t("deleteVerifyButton")}
                      </Button>
                    </AlertDialogFooter>
                  </>
                )}

                {deleteStep === "confirmType" && (
                  <>
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {t("deleteConfirmTypeLabel", { phrase: DELETE_CONFIRM_PHRASE })}
                      </p>
                      <Label>{t("deleteConfirmationLabel")}</Label>
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
                      <AlertDialogCancel onClick={resetDeleteDialog}>{t("deleteCancelButton")}</AlertDialogCancel>
                      <Button
                        onClick={handleFinalDelete}
                        disabled={confirmText.trim().toUpperCase() !== DELETE_CONFIRM_PHRASE}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      >
                        {t("deleteForeverButton")}
                      </Button>
                    </AlertDialogFooter>
                  </>
                )}

                {deleteStep === "deleting" && (
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-destructive border-t-transparent mb-4" />
                    <p className="text-sm text-muted-foreground">{t("deletingLabel")}</p>
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