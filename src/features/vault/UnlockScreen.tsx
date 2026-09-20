import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Smartphone, Globe, Sun, Moon, Monitor, KeyRound, Eye, EyeOff } from "lucide-react";
import logo from "@/assets/logo.png";
import { useActivity } from "@/hooks/useActivity";
import i18n from "@/i18n";
import { LANGUAGE_LABELS } from "@/i18n/languages";
import { getStoredTheme, storeTheme, applyTheme, Theme } from "@/lib/theme";

interface UnlockScreenProps {
  onUnlock: () => void;
}

const TRIGGER_CLASS =
  "h-9 rounded-full border bg-background/90 shadow-sm hover:bg-muted [&_svg:not(:first-child)]:hidden";

function LanguageSwitcher() {
  const [language, setLanguage] = useState(i18n.language);

  return (
    <Select
      value={language}
      onValueChange={(v) => {
        if (!v) return;
        setLanguage(v);
        i18n.changeLanguage(v);
      }}
    >
      <SelectTrigger className={`${TRIGGER_CLASS} px-3 gap-1.5`}>
        <Globe className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase">{language}</span>
      </SelectTrigger>
      <SelectContent align="end">
        {Object.entries(LANGUAGE_LABELS).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ThemeSwitcher() {
  const { t } = useTranslation("settings");
  const [theme, setTheme] = useState<Theme>(getStoredTheme());

  const icons: Record<Theme, React.ReactNode> = {
    light: <Sun className="h-4 w-4" />,
    dark: <Moon className="h-4 w-4" />,
    system: <Monitor className="h-4 w-4" />,
  };

  return (
    <Select
      value={theme}
      onValueChange={(v) => {
        if (!v) return;
        const value = v as Theme;
        setTheme(value);
        applyTheme(value);
        storeTheme(value);
      }}
    >
      <SelectTrigger className={`${TRIGGER_CLASS} w-9 p-0 justify-center`}>{icons[theme]}</SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="light">
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            {t("themeLight")}
          </div>
        </SelectItem>
        <SelectItem value="dark">
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4" />
            {t("themeDark")}
          </div>
        </SelectItem>
        <SelectItem value="system">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            {t("themeSystem")}
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function TopBar() {
  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
      <ThemeSwitcher />
      <LanguageSwitcher />
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  onKeyDown,
  placeholder,
  showLabel,
  hideLabel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  showLabel: string;
  hideLabel: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        title={visible ? hideLabel : showLabel}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function UnlockScreen({ onUnlock }: UnlockScreenProps) {
  const { t } = useTranslation("vault");
  const [checking, setChecking] = useState(true);
  const [exists, setExists] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const { saveActivity } = useActivity();

  useEffect(() => {
    invoke<boolean>("vault_exists").then((result) => {
      setExists(result);
      setChecking(false);
    });
  }, []);

  const handleCreate = async () => {
    setError("");
    if (password.length < 8) {
      setError(t("errorMinLength"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("errorMismatch"));
      return;
    }
    try {
      await invoke("create_vault", { masterPassword: password });
      await saveActivity("login", "firstLogin", "system");
      onUnlock();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleUnlock = async () => {
    setError("");
    try {
      await invoke("unlock_vault", { masterPassword: password });
      const totpEnabled = await invoke<boolean>("totp_status");
      if (totpEnabled) {
        setNeedsTotp(true);
      } else {
        await saveActivity("login", "login", "system");
        onUnlock();
      }
    } catch {
      setError(t("errorWrongPassword"));
    }
  };

  const handleVerifyTotp = async () => {
    setError("");
    try {
      const ok = await invoke<boolean>("totp_verify_unlock", { code: totpCode });
      if (ok) {
        await saveActivity("login", "loginWithTotp", "system");
        onUnlock();
      } else {
        setError(t("totpErrorIncorrect"));
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const handleVerifyBackupCode = async () => {
    setError("");
    try {
      const ok = await invoke<boolean>("totp_verify_backup_code", { code: backupCode });
      if (ok) {
        await saveActivity("login", "loginWithBackupCode", "system");
        onUnlock();
      } else {
        setError(t("backupCodeErrorIncorrect"));
      }
    } catch (e) {
      setError(String(e));
    }
  };

  if (checking) return null;

  if (needsTotp) {
    return (
      <div className="relative flex h-screen items-center justify-center bg-background">
        <TopBar />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-sm"
        >
          <Card className="shadow-xl">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Smartphone className="h-6 w-6" />
                </div>
              </div>
              <CardTitle>{t("totpTitle")}</CardTitle>
              <CardDescription>{t("totpDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!useBackupCode ? (
                <>
                  <PasswordField
                    value={totpCode}
                    onChange={setTotpCode}
                    onKeyDown={(e) => e.key === "Enter" && handleVerifyTotp()}
                    placeholder={t("totpPlaceholder")}
                    showLabel={t("showButton")}
                    hideLabel={t("hideButton")}
                    autoFocus
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button size="lg" onClick={handleVerifyTotp}>{t("totpVerifyButton")}</Button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseBackupCode(true);
                      setError("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline self-center"
                  >
                    {t("useBackupCodeLink")}
                  </button>
                </>
              ) : (
                <>
                  <PasswordField
                    value={backupCode}
                    onChange={setBackupCode}
                    onKeyDown={(e) => e.key === "Enter" && handleVerifyBackupCode()}
                    placeholder={t("backupCodePlaceholder")}
                    showLabel={t("showButton")}
                    hideLabel={t("hideButton")}
                    autoFocus
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button size="lg" onClick={handleVerifyBackupCode}>{t("verifyBackupCodeButton")}</Button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseBackupCode(false);
                      setError("");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground underline self-center"
                  >
                    {t("useTotpCodeLink")}
                  </button>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen items-center justify-center bg-background">
      <TopBar />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-sm"
      >
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <img src={logo} alt="Sailock" className="h-14 w-14" />
            </div>
            <CardTitle className="text-xl">{exists ? t("unlockTitle") : t("unlockCreateTitle")}</CardTitle>
            <CardDescription>{exists ? t("unlockDescription") : t("unlockCreateDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <PasswordField
              value={password}
              onChange={setPassword}
              onKeyDown={(e) => e.key === "Enter" && (exists ? handleUnlock() : handleCreate())}
              placeholder={t("passwordPlaceholder")}
              showLabel={t("showButton")}
              hideLabel={t("hideButton")}
              autoFocus
            />
            {!exists && (
              <PasswordField
                value={confirmPassword}
                onChange={setConfirmPassword}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder={t("confirmPasswordPlaceholder")}
                showLabel={t("showButton")}
                hideLabel={t("hideButton")}
              />
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button size="lg" className="gap-2" onClick={exists ? handleUnlock : handleCreate}>
              <KeyRound className="h-4 w-4" />
              {exists ? t("unlockButton") : t("createButton")}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}