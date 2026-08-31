import "./App.css";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { View } from "@/components/layout/Sidebar";
import { VaultView } from "@/features/vault/VaultView";
import { GeneratorView } from "@/features/generator/GeneratorView";
import { SettingsView } from "@/features/settings/SettingsView";
import { UnlockScreen } from "@/features/vault/UnlockScreen";

function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [active, setActive] = useState<View>("vault");

  const handleLock = async () => {
    await invoke("lock_vault");
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