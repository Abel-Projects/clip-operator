"use client";

import Link from "next/link";

type AppMode = "autopilot" | "manual" | "supoclip";

type ModeSwitchProps = {
  active: AppMode;
};

export default function ModeSwitch({ active }: ModeSwitchProps) {
  return (
    <div className="opus-mode-switch" role="tablist" aria-label="App mode">
      <Link
        href="/"
        role="tab"
        aria-selected={active === "autopilot"}
        className={`opus-mode-tab ${active === "autopilot" ? "active" : ""}`}
      >
        Autopilot
      </Link>
      <Link
        href="/workbench"
        role="tab"
        aria-selected={active === "manual"}
        className={`opus-mode-tab ${active === "manual" ? "active" : ""}`}
      >
        Manual
      </Link>
      <Link
        href="/supoclip"
        role="tab"
        aria-selected={active === "supoclip"}
        className={`opus-mode-tab ${active === "supoclip" ? "active" : ""}`}
      >
        SupoClip
      </Link>
    </div>
  );
}
