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

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [active, setActive] = useState<View>("vault");
  const { saveActivity } = useActivity();

  useEffect(() => {
    // Desactivar teclas de desarrollador y recarga
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

  const handleLock = async () => {
    await invoke("lock_vault");
    await saveActivity("logout", "Cierre de sesión", "system");
    setUnlocked(false);
  };

  if (!unlocked) {
    return <UnlockScreen onUnlock={() => setUnlocked(true)} />;
  }

  const renderView = () => {
    switch (active) {
      case "vault":
        return <VaultView />;
      case "generator":
        return <GeneratorView />;
      case "activity":
        return <ActivityView />;
      case "settings":
        return <SettingsView />;
    }
  };

  return (
    <Layout active={active} onChange={setActive} onLock={handleLock}>
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