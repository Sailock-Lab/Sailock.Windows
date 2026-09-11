import "./App.css";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
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
import { applyTextSize } from "@/lib/accessibility";
import {
  AutoLockDuration,
  TextSize,
  getStoredAutoLockDuration,
  storeAutoLockDuration,
  getStoredBool,
  storeBool,
  getStoredTextSize,
  storeTextSize,
} from "@/lib/appSettings";

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [active, setActive] = useState<View>("vault");
  const [vaultPrefillPassword, setVaultPrefillPassword] = useState<string | null>(null);
  const [autoLockDuration, setAutoLockDurationState] = useState<AutoLockDuration>(getStoredAutoLockDuration());
  const [lockOnMinimize, setLockOnMinimizeState] = useState<boolean>(() => getStoredBool("lockOnMinimize", false));
  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => getStoredBool("reduceMotion", false));
  const [textSize, setTextSizeState] = useState<TextSize>(getStoredTextSize());
  const { saveActivity } = useActivity();

  useEffect(() => {
    applyTheme(getStoredTheme());
    applyTextSize(getStoredTextSize());
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

  const handleLock = async (eventKey: string = "logout") => {
    await invoke("lock_vault");
    await saveActivity("logout", eventKey, "system");
    setUnlocked(false);
  };

  useAutoLock(autoLockDuration, unlocked, () => handleLock("logoutIdle"));
  useLockOnMinimize(unlocked && lockOnMinimize, () => handleLock("logoutMinimize"));

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

  const handleReduceMotionChange = (value: boolean) => {
    setReduceMotionState(value);
    storeBool("reduceMotion", value);
  };

  const handleTextSizeChange = (value: TextSize) => {
    setTextSizeState(value);
    storeTextSize(value);
    applyTextSize(value);
  };

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
            reduceMotion={reduceMotion}
            onReduceMotionChange={handleReduceMotionChange}
            textSize={textSize}
            onTextSizeChange={handleTextSizeChange}
          />
        );
    }
  };

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>
      {!unlocked ? (
        <UnlockScreen onUnlock={() => setUnlocked(true)} />
      ) : (
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
      )}
    </MotionConfig>
  );
}

export default App;