import { Button } from "@/components/ui/button";
import { KeyRound, Wand2, Settings, Lock } from "lucide-react";

export type View = "vault" | "generator" | "settings";

interface SidebarProps {
  active: View;
  onChange: (view: View) => void;
}

const items: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "vault", label: "Vault", icon: KeyRound },
  { id: "generator", label: "Generador", icon: Wand2 },
  { id: "settings", label: "Ajustes", icon: Settings },
];

export function Sidebar({ active, onChange }: SidebarProps) {
  return (
    <aside className="w-56 border-r bg-muted/30 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 mb-4 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Lock className="h-4 w-4" />
        </div>
        <h1 className="text-xl font-bold">Sailock</h1>
      </div>
      {items.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={active === id ? "secondary" : "ghost"}
          className="justify-start gap-2"
          onClick={() => onChange(id)}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Button>
      ))}
    </aside>
  );
}