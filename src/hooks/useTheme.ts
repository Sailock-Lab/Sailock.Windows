import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useActivity } from "@/hooks/useActivity";
import { getStoredTheme, storeTheme, applyTheme, Theme } from "@/lib/theme";

export const THEMES: Theme[] = ["light", "dark", "system"];

let current: Theme = getStoredTheme();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Theme {
  return current;
}

export function useTheme() {
  const { t } = useTranslation("settings");
  const { saveActivity } = useActivity();
  const theme = useSyncExternalStore(subscribe, getSnapshot);

  const labels: Record<Theme, string> = {
    light: t("themeLight"),
    dark: t("themeDark"),
    system: t("themeSystem"),
  };

  const setTheme = (value: Theme | null) => {
    if (!value || value === current) return;
    current = value;
    applyTheme(value);
    storeTheme(value);
    listeners.forEach((l) => l());
    saveActivity("edit", "themeChanged", "settings", { theme: value });
    toast.success(t("themeChangedToast", { theme: labels[value] }));
  };

  return { theme, setTheme, labels };
}
