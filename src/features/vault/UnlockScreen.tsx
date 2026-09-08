import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Smartphone, Globe } from "lucide-react";
import logo from "@/assets/logo.png";
import { useActivity } from "@/hooks/useActivity";
import i18n from "@/i18n";
import { LANGUAGE_LABELS } from "@/i18n/languages";

interface UnlockScreenProps {
  onUnlock: () => void;
}

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
      <SelectTrigger className="w-9 h-9 p-0 justify-center rounded-full border-none bg-muted/50 hover:bg-muted [&_svg:not(:first-child)]:hidden">
        <Globe className="h-4 w-4" />
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
      await saveActivity("login", "Primer inicio de sesión - Vault creado", "system");
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
        await saveActivity("login", "Inicio de sesión", "system");
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
        await saveActivity("login", "Inicio de sesión (con verificación en dos pasos)", "system");
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
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
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
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
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