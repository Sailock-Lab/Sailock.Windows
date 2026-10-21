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
      {/* El generador reparte la altura entre sus paneles (cada uno con su scroll): sin esto, el redondeo de píxeles
          con zoom o escalado de Windows añade un scroll fantasma de 2-3 px a la ventana. */}
      <main className={`flex-1 p-8 ${active === "generator" ? "overflow-y-auto md:overflow-hidden" : "overflow-y-auto"}`}>
        {children}
      </main>
    </div>
  );
}