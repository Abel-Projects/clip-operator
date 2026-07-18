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

function isBrokenEmbedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local") ||
      host.endsWith("trycloudflare.com")
    );
  } catch {
    return true;
  }
}

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

  const frontendUrl = status?.frontendUrl ?? "";
  const brokenHost = !frontendUrl || isBrokenEmbedHost(frontendUrl);
  const canEmbed = Boolean(status?.canEmbed) && !brokenHost;
  const tailscaleUi =
    process.env.NEXT_PUBLIC_SUPOCLIP_TAILSCALE_URL?.trim() ||
    "http://home-server.tailf72f6f.ts.net:3107";

  return (
    <SiteShell subtitle="SupoClip editor" back wide>
      <section className="opus-embed-panel">
        <p className="opus-hint">
          SupoClip editor runs on the home server. Autopilot clipping does not need
          this page — the outbound clip worker handles that.
        </p>
        {loadError ? (
          <div className="opus-alert" role="alert">
            {loadError}
          </div>
        ) : null}

        {!canEmbed ? (
          <div className="opus-panel" role="status">
            <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Open SupoClip on the home server</h2>
            <p className="opus-hint" style={{ marginTop: "0.5rem" }}>
              Vercel can&apos;t iframe a private Tailscale URL. Autopilot still clips without
              this page — use this only when you want the manual editor.
            </p>
            <p style={{ marginTop: "1rem" }}>
              <a className="opus-secondary" href={tailscaleUi} target="_blank" rel="noreferrer">
                Open SupoClip editor
              </a>
            </p>
            <p className="opus-hint" style={{ marginTop: "0.75rem" }}>
              Needs Tailscale on this device →{" "}
              <a className="opus-textlink" href={tailscaleUi} target="_blank" rel="noreferrer">
                {tailscaleUi}
              </a>
            </p>
            <p className="opus-hint" style={{ marginTop: "0.5rem" }}>
              Local alternative: <code>deploy/start-dev.ps1</code>, then{" "}
              <code>http://localhost:3107</code>.
            </p>
          </div>
        ) : (
          <iframe
            className="opus-embed-frame"
            src={`${frontendUrl}${frontendUrl.includes("?") ? "&" : "?"}embed=1`}
            title="SupoClip"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </section>
    </SiteShell>
  );
}
