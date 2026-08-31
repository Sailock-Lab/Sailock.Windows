import { useState } from "react";
import { Button } from "@/components/ui/button";
import { KeyRound, Wand2, Settings, LogOut, ChevronLeft, ChevronRight, History } from "lucide-react";
import logo from "@/assets/logo.png";

export type View = "vault" | "generator" | "settings" | "activity";

interface SidebarProps {
  active: View;
  onChange: (view: View) => void;
  onLock: () => void;
}

const items: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "vault", label: "Vault", icon: KeyRound },
  { id: "generator", label: "Generador", icon: Wand2 },
  { id: "activity", label: "Auditoría", icon: History },
  { id: "settings", label: "Ajustes", icon: Settings },
];

export function Sidebar({ active, onChange, onLock }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`border-r bg-muted/30 p-4 flex flex-col gap-2 transition-all duration-300 ${
        collapsed ? "w-20" : "w-56"
      }`}
    >
      <div className={`flex items-center gap-2 mb-2 px-2 ${collapsed ? "justify-center" : ""}`}>
        <img src={logo} alt="Sailock" className="h-8 w-8 shrink-0" />
        {!collapsed && <h1 className="text-xl font-bold">Sailock</h1>}
      </div>

      <div className="border-t my-2" />

      {items.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={active === id ? "default" : "ghost"}
          className={`gap-2 transition-all duration-200 ${
            collapsed ? "justify-center px-0" : "justify-start"
          } ${
            active === id 
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" 
              : "hover:bg-muted hover:text-foreground hover:scale-[1.02]"
          }`}
          onClick={() => onChange(id)}
          title={collapsed ? label : undefined}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && label}
        </Button>
      ))}

      <div className="border-t my-2" />

      {/* Botón Cerrar Sesión */}
      <Button
        variant="outline"
        className={`gap-2 mt-auto transition-all duration-200 border-destructive/50 text-destructive hover:bg-destructive hover:text-white hover:border-destructive hover:scale-[1.02] ${
          collapsed ? "justify-center px-0" : "justify-center"
        }`}
        onClick={onLock}
        title={collapsed ? "Cerrar Sesión" : undefined}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed && "Cerrar Sesión"}
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