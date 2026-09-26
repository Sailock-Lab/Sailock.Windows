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

function BackgroundDecor() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Large green glow - top left */}
      <div
        className="
          absolute -left-52 -top-52
          h-[720px] w-[720px]
          rounded-full
          bg-primary/[0.20]
          blur-[80px]
          dark:bg-primary/[0.18]
        "
      />

      {/* Large green glow - bottom right */}
      <div
        className="
          absolute -bottom-64 -right-56
          h-[760px] w-[760px]
          rounded-full
          bg-primary/[0.18]
          blur-[90px]
          dark:bg-primary/[0.20]
        "
      />

      {/* Secondary glow */}
      <div
        className="
          absolute right-[18%] top-[8%]
          h-[320px] w-[320px]
          rounded-full
          bg-primary/[0.06]
          blur-[100px]
          dark:bg-primary/[0.08]
        "
      />

      {/* Top-left organic shape */}
      <svg
        className="absolute -left-[180px] -top-[120px] h-[620px] w-[650px]"
        viewBox="0 0 650 620"
        fill="none"
      >
        <path
          d="M0 120C120 40 270 10 390 90C520 176 570 300 650 390V0H0V120Z"
          className="fill-primary/[0.12] dark:fill-primary/[0.13]"
        />

        <path
          d="M-30 310C100 210 160 110 300 90C420 72 475 180 520 290"
          className="stroke-primary/[0.22] dark:stroke-primary/[0.25]"
          strokeWidth="2"
        />

        <path
          d="M-20 350C120 250 185 150 315 135C430 122 475 220 525 330"
          className="stroke-primary/[0.16] dark:stroke-primary/[0.18]"
          strokeWidth="2"
        />

        <path
          d="M0 390C120 310 220 200 335 185C430 172 470 250 510 355"
          className="stroke-primary/[0.11] dark:stroke-primary/[0.14]"
          strokeWidth="1.5"
        />
      </svg>

      {/* Bottom-right organic shape */}
      <svg
        className="absolute -bottom-[170px] -right-[150px] h-[620px] w-[650px]"
        viewBox="0 0 650 620"
        fill="none"
      >
        <path
          d="M650 500C520 570 380 590 250 520C120 450 80 320 0 220V620H650V500Z"
          className="fill-primary/[0.12] dark:fill-primary/[0.14]"
        />

        <path
          d="M680 300C540 400 470 500 340 520C220 540 175 440 120 330"
          className="stroke-primary/[0.22] dark:stroke-primary/[0.25]"
          strokeWidth="2"
        />

        <path
          d="M670 260C530 365 460 460 330 480C215 498 165 395 110 285"
          className="stroke-primary/[0.16] dark:stroke-primary/[0.18]"
          strokeWidth="2"
        />

        <path
          d="M660 220C535 320 450 420 325 440C230 455 170 350 115 245"
          className="stroke-primary/[0.11] dark:stroke-primary/[0.14]"
          strokeWidth="1.5"
        />
      </svg>

      {/* Subtle center wave */}
      <svg
        className="absolute inset-x-0 bottom-0 h-[42%] w-full"
        viewBox="0 0 1440 500"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M0 390C220 270 410 450 680 340C960 225 1170 310 1440 170V500H0Z"
          className="fill-primary/[0.035] dark:fill-primary/[0.05]"
        />
      </svg>
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
      <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
        <BackgroundDecor />
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
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
      <BackgroundDecor />
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