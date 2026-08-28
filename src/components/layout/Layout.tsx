import { ReactNode } from "react";
import { Sidebar, View } from "./Sidebar";

interface LayoutProps {
  active: View;
  onChange: (view: View) => void;
  children: ReactNode;
}

export function Layout({ active, onChange, children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar active={active} onChange={onChange} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}