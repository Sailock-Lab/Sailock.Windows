import { useState } from "react";
import { Button } from "@/components/ui/button";
import { KeyRound, Wand2, Settings, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import logo from "@/assets/logo.png";

export type View = "vault" | "generator" | "settings";

interface SidebarProps {
  active: View;
  onChange: (view: View) => void;
  onLock: () => void;
}

const items: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "vault", label: "Vault", icon: KeyRound },
  { id: "generator", label: "Generador", icon: Wand2 },
  { id: "settings", label: "Ajustes", icon: Settings },
];

export function Sidebar({ active, onChange, onLock }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`border-r bg-muted/30 p-4 flex flex-col gap-2 transition-all ${
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
          variant={active === id ? "secondary" : "ghost"}
          className={`gap-2 ${collapsed ? "justify-center px-0" : "justify-start"}`}
          onClick={() => onChange(id)}
          title={collapsed ? label : undefined}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && label}
        </Button>
      ))}

      <Button
        variant="ghost"
        className={`gap-2 mt-auto text-muted-foreground ${collapsed ? "justify-center px-0" : "justify-start"}`}
        onClick={onLock}
        title={collapsed ? "Bloquear" : undefined}
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {!collapsed && "Bloquear"}
      </Button>

      <Button variant="ghost" size="icon" className="self-center" onClick={() => setCollapsed(!collapsed)}>
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
    </aside>
  );
}