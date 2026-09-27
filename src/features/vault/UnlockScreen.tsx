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
  "rounded-full border border-border/80 bg-card shadow-sm hover:bg-muted hover:border-border transition-colors [&_svg:not(:first-child)]:hidden h-9 sm:h-10 lg:h-11";

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
      <SelectTrigger className={`${TRIGGER_CLASS} px-3 sm:px-3.5 lg:px-4 gap-1.5`}>
        <Globe className="h-4 w-4 sm:h-4.5 sm:w-4.5 lg:h-5 lg:w-5 text-foreground" />
        <span className="text-xs sm:text-sm font-medium tracking-wide text-foreground">
          {language.toUpperCase()}
        </span>
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
    light: <Sun className="h-4 w-4 sm:h-4.5 sm:w-4.5 lg:h-5 lg:w-5 text-foreground" />,
    dark: <Moon className="h-4 w-4 sm:h-4.5 sm:w-4.5 lg:h-5 lg:w-5 text-foreground" />,
    system: <Monitor className="h-4 w-4 sm:h-4.5 sm:w-4.5 lg:h-5 lg:w-5 text-foreground" />,
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
      <SelectTrigger className={`${TRIGGER_CLASS} w-9 sm:w-10 lg:w-11 p-0 justify-center`}>
        {icons[theme]}
      </SelectTrigger>
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
        className="pr-10 h-10 sm:h-11 lg:h-12 text-sm lg:text-base"
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
          absolute -left-56 -top-56
          h-[740px] w-[740px]
          rounded-full
          bg-primary/[0.19]
          blur-[85px]
          dark:bg-primary/[0.18]
        "
      />

      {/* Large green glow - bottom right (mirrored, same size/opacity/blur) */}
      <div
        className="
          absolute -bottom-56 -right-56
          h-[740px] w-[740px]
          rounded-full
          bg-primary/[0.19]
          blur-[85px]
          dark:bg-primary/[0.18]
        "
      />

      {/* Secondary glow - top right */}
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

      {/* Secondary glow - bottom left (mirrored counterpart) */}
      <div
        className="
          absolute left-[18%] bottom-[8%]
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

      {/* Bottom-right organic shape — same SVG as top-left, rotated 180° for exact mirror symmetry */}
      <svg
        className="absolute -right-[180px] -bottom-[120px] h-[620px] w-[650px] rotate-180"
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
      </svg>feat(ui): make login theme/language switchers more visible, add symmetric background and responsive card scaling
    </div>
  );
}

const SCREEN_WRAP_CLASS = "relative flex h-screen items-center justify-center overflow-hidden bg-background";

const CARD_OUTER_CLASS =
  "relative z-10 w-full max-w-[360px] sm:max-w-[460px] lg:max-w-[620px] px-4 sm:px-6";

const CARD_CLASS =
  "overflow-hidden rounded-[28px] border border-border/50 bg-card/90 shadow-[0_24px_80px_rgba(0,0,0,0.12)] backdrop-blur-2xl dark:bg-card/85 dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]";

const CARD_HEADER_CLASS = "px-6 pt-7 pb-4 sm:px-8 sm:pt-8 sm:pb-5 lg:px-10 lg:pt-10 lg:pb-6 text-center";

const CARD_CONTENT_CLASS = "px-6 pb-7 sm:px-8 sm:pb-8 lg:px-8 lg:pb-10";

const ICON_WRAP_CLASS =
  "flex items-center justify-center rounded-[22px] bg-primary/10 ring-1 ring-primary/15 dark:bg-primary/15 h-14 w-14 sm:h-16 sm:w-16 lg:h-20 lg:w-20";

const ICON_CLASS = "text-primary h-6 w-6 sm:h-7 sm:w-7 lg:h-10 lg:w-10";

const CARD_TITLE_CLASS = "font-bold tracking-tight text-xl sm:text-2xl lg:text-3xl";

const CARD_DESCRIPTION_CLASS = "mt-2 text-xs sm:text-sm lg:text-base";

const CARD_BODY_GAP_CLASS = "flex flex-col gap-3 sm:gap-4 lg:gap-5";

const PRIMARY_BUTTON_CLASS =
  "mt-1 w-full gap-2 rounded-xl font-semibold shadow-sm transition-all hover:shadow-md h-10 sm:h-11 lg:h-12 text-sm lg:text-base";

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
      <div className={SCREEN_WRAP_CLASS}>
        <BackgroundDecor />
        <TopBar />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={CARD_OUTER_CLASS}
        >
          <Card className={CARD_CLASS}>
            <CardHeader className={CARD_HEADER_CLASS}>
              <div className="mb-5 flex justify-center">
                <div className={ICON_WRAP_CLASS}>
                  <Smartphone className={ICON_CLASS} />
                </div>
              </div>
              <CardTitle className={CARD_TITLE_CLASS}>{t("totpTitle")}</CardTitle>
              <CardDescription className={CARD_DESCRIPTION_CLASS}>{t("totpDescription")}</CardDescription>
            </CardHeader>

            <CardContent className={CARD_CONTENT_CLASS}>
              <div className={CARD_BODY_GAP_CLASS}>
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
                    {error && <p className="text-xs sm:text-sm text-destructive">{error}</p>}
                    <Button size="lg" className={PRIMARY_BUTTON_CLASS} onClick={handleVerifyTotp}>
                      {t("totpVerifyButton")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseBackupCode(true);
                        setError("");
                      }}
                      className="text-[11px] sm:text-xs text-muted-foreground hover:text-foreground underline self-center"
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
                    {error && <p className="text-xs sm:text-sm text-destructive">{error}</p>}
                    <Button size="lg" className={PRIMARY_BUTTON_CLASS} onClick={handleVerifyBackupCode}>
                      {t("verifyBackupCodeButton")}
                    </Button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseBackupCode(false);
                        setError("");
                      }}
                      className="text-[11px] sm:text-xs text-muted-foreground hover:text-foreground underline self-center"
                    >
                      {t("useTotpCodeLink")}
                    </button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={SCREEN_WRAP_CLASS}>
      <BackgroundDecor />
      <TopBar />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={CARD_OUTER_CLASS}
      >
        <Card className={CARD_CLASS}>
          <CardHeader className={CARD_HEADER_CLASS}>
            <div className="mb-5 flex justify-center">
              <div className={ICON_WRAP_CLASS}>
                <img src={logo} alt="Sailock" className="h-[62%] w-[62%] object-contain" />
              </div>
            </div>
            <CardTitle className={CARD_TITLE_CLASS}>
              {exists ? t("unlockTitle") : t("unlockCreateTitle")}
            </CardTitle>
            <CardDescription className={CARD_DESCRIPTION_CLASS}>
              {exists ? t("unlockDescription") : t("unlockCreateDescription")}
            </CardDescription>
          </CardHeader>

          <CardContent className={CARD_CONTENT_CLASS}>
            <div className={CARD_BODY_GAP_CLASS}>
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

              {error && <p className="text-xs sm:text-sm text-destructive">{error}</p>}

              <Button size="lg" className={PRIMARY_BUTTON_CLASS} onClick={exists ? handleUnlock : handleCreate}>
                <KeyRound className="h-4 w-4 lg:h-5 lg:w-5" />
                {exists ? t("unlockButton") : t("createButton")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}