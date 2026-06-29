"use client";

import { ReactNode } from "react";
import ModeSwitch from "./mode-switch";

type AppMode = "autopilot" | "manual";

type SiteShellProps = {
  mode: AppMode;
  wide?: boolean;
  children: ReactNode;
};

export default function SiteShell({ mode, wide, children }: SiteShellProps) {
  return (
    <main className={`opus-page ${wide ? "opus-page-wide" : ""}`}>
      <header className="opus-topbar">
        <div className="opus-brand">
          <span className="opus-logo">Clip Operator</span>
        </div>
        <ModeSwitch active={mode} />
      </header>
      {children}
    </main>
  );
}
