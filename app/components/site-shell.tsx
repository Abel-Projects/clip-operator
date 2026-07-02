"use client";

import Link from "next/link";
import { ReactNode } from "react";
import ThemeToggle from "./theme-toggle";

type SiteShellProps = {
  /** Small label under the brand, e.g. the niche or the page name. */
  subtitle?: string;
  /** Show a "← Dashboard" link instead of nothing (for secondary pages). */
  back?: boolean;
  wide?: boolean;
  /** Optional right-aligned header content (status, actions). */
  right?: ReactNode;
  children: ReactNode;
};

export default function SiteShell({ subtitle, back, wide, right, children }: SiteShellProps) {
  return (
    <main className={`opus-page ${wide ? "opus-page-wide" : ""}`}>
      <header className="opus-topbar">
        <div className="opus-brand">
          <Link href="/" className="opus-logo">
            Clip Operator
          </Link>
          {subtitle ? <span className="opus-brand-sub">{subtitle}</span> : null}
        </div>
        <div className="opus-topbar-right">
          {right}
          {back ? (
            <Link href="/" className="opus-backlink">
              ← Dashboard
            </Link>
          ) : null}
          <ThemeToggle />
        </div>
      </header>
      {children}
    </main>
  );
}
