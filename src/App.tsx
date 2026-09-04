import "./App.css";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { View } from "@/components/layout/Sidebar";
import { VaultView } from "@/features/vault/VaultView";
import { GeneratorView } from "@/features/generator/GeneratorView";
import { SettingsView } from "@/features/settings/SettingsView";
import { ActivityView } from "@/features/activity/ActivityView";
import { UnlockScreen } from "@/features/vault/UnlockScreen";
import { useActivity } from "@/hooks/useActivity";
import { useAutoLock } from "@/hooks/useAutoLock";
import { useLockOnMinimize } from "@/hooks/useLockOnMinimize";
import { getStoredTheme, applyTheme } from "@/lib/theme";
import {
  AutoLockDuration,
  getStoredAutoLockDuration,
  storeAutoLockDuration,
  getStoredBool,
  storeBool,
} from "@/lib/appSettings";

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [active, setActive] = useState<View>("vault");
  const [vaultPrefillPassword, setVaultPrefillPassword] = useState<string | null>(null);
  const [autoLockDuration, setAutoLockDurationState] = useState<AutoLockDuration>(getStoredAutoLockDuration());
  const [lockOnMinimize, setLockOnMinimizeState] = useState<boolean>(() => getStoredBool("lockOnMinimize", false));
  const { saveActivity } = useActivity();

  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F12") {
        e.preventDefault();
        return false;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        return false;
      }
      if (e.key === "F5") {
        e.preventDefault();
        return false;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        return false;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        return false;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  const handleLock = async (reason: string = "Cierre de sesión") => {
    await invoke("lock_vault");
    await saveActivity("logout", reason, "system");
    setUnlocked(false);
  };

  useAutoLock(autoLockDuration, unlocked, () => handleLock("Bloqueo automático por inactividad"));
  useLockOnMinimize(unlocked && lockOnMinimize, () => handleLock("Bloqueo automático al minimizar la ventana"));

  const handleVaultDeleted = () => {
    setUnlocked(false);
    setActive("vault");
  };

  const handleAddToVault = (password: string) => {
    setVaultPrefillPassword(password);
    setActive("vault");
  };

  const handleAutoLockDurationChange = (value: AutoLockDuration) => {
    setAutoLockDurationState(value);
    storeAutoLockDuration(value);
  };

  const handleLockOnMinimizeChange = (value: boolean) => {
    setLockOnMinimizeState(value);
    storeBool("lockOnMinimize", value);
  };

  if (!unlocked) {
    return <UnlockScreen onUnlock={() => setUnlocked(true)} />;
  }

  const renderView = () => {
    switch (active) {
      case "vault":
        return (
          <VaultView
            prefillPassword={vaultPrefillPassword}
            onPrefillConsumed={() => setVaultPrefillPassword(null)}
          />
        );
      case "generator":
        return <GeneratorView onAddToVault={handleAddToVault} />;
      case "activity":
        return <ActivityView />;
      case "settings":
        return (
          <SettingsView
            onVaultDeleted={handleVaultDeleted}
            autoLockDuration={autoLockDuration}
            onAutoLockDurationChange={handleAutoLockDurationChange}
            lockOnMinimize={lockOnMinimize}
            onLockOnMinimizeChange={handleLockOnMinimizeChange}
          />
        );
    }
  };

  return (
    <Layout active={active} onChange={setActive} onLock={() => handleLock()}>
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="h-full"
        >
          {renderView()}
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}

export default App;