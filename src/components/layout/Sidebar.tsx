import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { KeyRound, ShieldCheck, Wand2, Settings, LogOut, ChevronLeft, ChevronRight, History, Sun, Moon, Monitor } from "lucide-react";
import logo from "@/assets/logo.png";
import { ShortcutAction, formatComboText, useShortcutBindings } from "@/lib/shortcuts";
import { THEMES, useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/lib/theme";

export type View = "vault" | "totp" | "generator" | "settings" | "activity";

interface SidebarProps {
  active: View;
  onChange: (view: View) => void;
  onLock: () => void;
}

const items: { id: View; icon: React.ElementType; shortcut: ShortcutAction }[] = [
  { id: "vault", icon: KeyRound, shortcut: "goVault" },
  { id: "totp", icon: ShieldCheck, shortcut: "goTotp" },
  { id: "generator", icon: Wand2, shortcut: "goGenerator" },
  { id: "activity", icon: History, shortcut: "goActivity" },
  { id: "settings", icon: Settings, shortcut: "goSettings" },
];

const THEME_ICONS: Record<Theme, React.ElementType> = { light: Sun, dark: Moon, system: Monitor };

export function Sidebar({ active, onChange, onLock }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { t } = useTranslation("sidebar");
  const shortcuts = useShortcutBindings();
  const { theme, setTheme, labels: themeLabels } = useTheme();
  const CurrentThemeIcon = THEME_ICONS[theme];

  // Texto del tooltip: el nombre (si la barra está plegada) y el atajo que tenga asignado.
  const tooltip = (label: string, combo: string, showLabel: boolean) => {
    const hint = combo ? formatComboText(combo) : "";
    if (showLabel) return hint ? `${label} (${hint})` : label;
    return hint || undefined;
  };

  return (
    <aside
      className={`border-r bg-muted/30 p-4 flex flex-col gap-2 transition-all duration-300 ${collapsed ? "w-20" : "w-56"
        }`}
    >
      <div className={`flex items-center gap-2 mb-2 px-2 ${collapsed ? "justify-center" : ""}`}>
        <img src={logo} alt="Sailock" className="h-8 w-8 shrink-0" />
        {!collapsed && <h1 className="text-xl font-bold">Sailock</h1>}
      </div>

      <div className="border-t my-2" />

      {items.map(({ id, icon: Icon, shortcut }) => {
        const label = t(id);
        return (
          <Button
            key={id}
            variant={active === id ? "default" : "ghost"}
            className={`gap-2 transition-all duration-200 ${collapsed ? "justify-center px-0" : "justify-start"
              } ${active === id
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                : "hover:bg-muted hover:text-foreground hover:scale-[1.02]"
              }`}
            onClick={() => onChange(id)}
            title={tooltip(label, shortcuts[shortcut], collapsed)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && label}
          </Button>
        );
      })}

      <div className="border-t my-2" />

      {/* Tema: los mismos tres ajustes que en Ajustes → Apariencia. Plegada, un botón que va pasando de uno a otro. */}
      <div className="mt-auto">
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="mx-auto flex hover:bg-muted hover:scale-105 transition-all duration-200"
            onClick={() => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])}
            title={themeLabels[theme]}
            aria-label={themeLabels[theme]}
          >
            <CurrentThemeIcon className="h-4 w-4" />
          </Button>
        ) : (
          <div role="radiogroup" aria-label={t("themeGroupLabel")} className="flex rounded-md border bg-background p-0.5">
            {THEMES.map((value) => {
              const Icon = THEME_ICONS[value];
              const isActive = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={themeLabels[value]}
                  title={themeLabels[value]}
                  onClick={() => setTheme(value)}
                  className={`flex h-7 flex-1 items-center justify-center rounded-sm transition-colors ${
                    isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Button
        variant="outline"
        className={`gap-2 transition-all duration-200 border-destructive/50 text-destructive hover:bg-destructive hover:text-white hover:border-destructive hover:scale-[1.02] dark:high-contrast:hover:bg-[oklch(0.55_0.22_25)] ${collapsed ? "justify-center px-0" : "justify-center"
          }`}
        onClick={onLock}
        title={tooltip(t("lock"), shortcuts.lock, collapsed)}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed && t("lock")}
      </Button>

      <div className="border-t my-2" />

      <Button
        variant="ghost"
        size="icon"
        className="self-center hover:bg-muted hover:scale-105 transition-all duration-200"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
    </aside>
  );
}