import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Smartphone, Globe, Sun, Moon, Monitor } from "lucide-react";
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
    <div className="absolute top-4 right-4 flex items-center gap-2">
      <ThemeSwitcher />
      <LanguageSwitcher />
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

  if (checking) return null;

  if (needsTotp) {
    return (
      <div className="relative flex h-screen items-center justify-center bg-background">
        <TopBar />
        <Card className="w-full max-w-sm">
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
            <Input
              placeholder={t("totpPlaceholder")}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVerifyTotp()}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleVerifyTotp}>{t("totpVerifyButton")}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen items-center justify-center bg-background">
      <TopBar />
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src={logo} alt="Sailock" className="h-12 w-12" />
          </div>
          <CardTitle>{exists ? t("unlockTitle") : t("unlockCreateTitle")}</CardTitle>
          <CardDescription>{exists ? t("unlockDescription") : t("unlockCreateDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            type="password"
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (exists ? handleUnlock() : handleCreate())}
          />
          {!exists && (
            <Input
              type="password"
              placeholder={t("confirmPasswordPlaceholder")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={exists ? handleUnlock : handleCreate}>
            {exists ? t("unlockButton") : t("createButton")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}