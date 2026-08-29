import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import logo from "@/assets/logo.png";

interface UnlockScreenProps {
  onUnlock: () => void;
}

export function UnlockScreen({ onUnlock }: UnlockScreenProps) {
  const [checking, setChecking] = useState(true);
  const [exists, setExists] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    invoke<boolean>("vault_exists").then((result) => {
      setExists(result);
      setChecking(false);
    });
  }, []);

  const handleCreate = async () => {
    setError("");
    if (password.length < 8) {
      setError("La contraseña maestra debe tener al menos 8 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }
    try {
      await invoke("create_vault", { masterPassword: password });
      onUnlock();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleUnlock = async () => {
    setError("");
    try {
      await invoke("unlock_vault", { masterPassword: password });
      onUnlock();
    } catch {
      setError("Contraseña maestra incorrecta");
    }
  };

  if (checking) return null;

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src={logo} alt="Sailock" className="h-12 w-12" />
          </div>
          <CardTitle>{exists ? "Desbloquear Sailock" : "Crea tu contraseña maestra"}</CardTitle>
          <CardDescription>
            {exists
              ? "Introduce tu contraseña maestra para acceder al vault."
              : "Esta contraseña protege todo tu vault. Si la olvidas, no hay forma de recuperar tus datos."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            type="password"
            placeholder="Contraseña maestra"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (exists ? handleUnlock() : handleCreate())}
          />
          {!exists && (
            <Input
              type="password"
              placeholder="Repite la contraseña maestra"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={exists ? handleUnlock : handleCreate}>
            {exists ? "Desbloquear" : "Crear vault"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}