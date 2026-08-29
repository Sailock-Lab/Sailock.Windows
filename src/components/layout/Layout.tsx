import { ReactNode } from "react";
import { Sidebar, View } from "./Sidebar";

interface LayoutProps {
  active: View;
  onChange: (view: View) => void;
  onLock: () => void;
  children: ReactNode;
}

export function Layout({ active, onChange, onLock, children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar active={active} onChange={onChange} onLock={onLock} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}