"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import PasswordGate from "@/app/components/password-gate";
import SiteShell from "@/app/components/site-shell";
import {
  authFetch,
  clearSitePassword,
  getStoredSitePassword,
  storeSitePassword
} from "@/lib/client-auth";

type ConfigStatus = {
  canEmbed: boolean;
  backendReachable: boolean;
  frontendUrl: string;
  baseUrl: string;
};

export default function SupoClipEmbed() {
  const [siteUnlocked, setSiteUnlocked] = useState(false);
  const [sitePassword, setSitePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [loadError, setLoadError] = useState("");

  const loadConfig = useCallback(async (): Promise<boolean> => {
    setLoadError("");
    try {
      const response = await authFetch("/api/supoclip/config");
      if (response.status === 401) {
        clearSitePassword();
        setPasswordError("Wrong password.");
        return false;
      }
      if (!response.ok) {
        setLoadError(`Could not load SupoClip config (${response.status}).`);
        return false;
      }
      const data = (await response.json()) as ConfigStatus;
      setStatus(data);
      return true;
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load SupoClip config."
      );
      return false;
    }
  }, []);

  const handleUnlockSite = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPasswordError("");

      const password = sitePassword.trim();
      if (!password) {
        return;
      }

      storeSitePassword(password);
      const ok = await loadConfig();
      if (ok) {
        setSiteUnlocked(true);
      }
    },
    [loadConfig, sitePassword]
  );

  useEffect(() => {
    const stored = getStoredSitePassword();
    if (!stored) {
      return;
    }

    setSitePassword(stored);
    void loadConfig().then((ok) => {
      if (ok) {
        setSiteUnlocked(true);
      }
    });
  }, [loadConfig]);

  if (!siteUnlocked) {
    return (
      <PasswordGate
        password={sitePassword}
        error={passwordError || loadError}
        onPasswordChange={setSitePassword}
        onSubmit={handleUnlockSite}
      />
    );
  }

  const frontendUrl = status?.frontendUrl ?? "http://localhost:3107";
  const canEmbed = Boolean(status?.canEmbed);
  const backendReachable = Boolean(status?.backendReachable);
  const looksLocal =
    frontendUrl.includes("localhost") || frontendUrl.includes("127.0.0.1");

  return (
    <SiteShell subtitle="SupoClip editor" back wide>
      <section className="opus-embed-panel">
        <p className="opus-hint">
          Full SupoClip editor on your home server. Autopilot clipping uses the
          outbound clip worker — this page is just the visual editor.
        </p>
        {loadError ? (
          <div className="opus-alert" role="alert">
            {loadError}
          </div>
        ) : null}
        {!canEmbed ? (
          <div className="opus-alert" role="alert">
            Set <code>SUPOCLIP_FRONTEND_URL</code> and <code>SUPOCLIP_USER_ID</code> on
            Vercel to load the editor.
          </div>
        ) : (
          <>
            {!backendReachable ? (
              <div className="opus-alert" role="alert">
                SupoClip API isn&apos;t reachable from this app host (
                <code>{status?.baseUrl}</code>). Autopilot can still clip via the
                home-server worker. For the editor iframe, use local tunnel (
                <code>deploy/start-dev.ps1</code>) or open{" "}
                <a className="opus-textlink" href={frontendUrl} target="_blank" rel="noreferrer">
                  {frontendUrl}
                </a>{" "}
                directly on Tailscale.
              </div>
            ) : null}
            {looksLocal ? (
              <div className="opus-alert" role="alert">
                Editor URL is <code>localhost</code>. From the production site that
                iframe can&apos;t reach your PC — run{" "}
                <code>deploy/start-dev.ps1</code> and open{" "}
                <code>http://localhost:3000/supoclip</code>, or open{" "}
                <a className="opus-textlink" href={frontendUrl} target="_blank" rel="noreferrer">
                  {frontendUrl}
                </a>{" "}
                on the home server / Tailscale.
              </div>
            ) : null}
            <iframe
              className="opus-embed-frame"
              src={`${frontendUrl}${frontendUrl.includes("?") ? "&" : "?"}embed=1`}
              title="SupoClip"
              allow="clipboard-read; clipboard-write"
            />
          </>
        )}
      </section>
    </SiteShell>
  );
}
