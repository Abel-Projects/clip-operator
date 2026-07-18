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
  embedUrl: string | null;
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
  const embedUrl = status?.embedUrl?.trim() || "";
  const brokenHost = !frontendUrl || isBrokenEmbedHost(frontendUrl);
  const canEmbed = Boolean(status?.canEmbed) && !brokenHost && Boolean(embedUrl);
  const tailscaleUi =
    process.env.NEXT_PUBLIC_SUPOCLIP_TAILSCALE_URL?.trim() ||
    "https://home-server.tailf72f6f.ts.net/list";

  return (
    <SiteShell subtitle="SupoClip clips" back wide>
      <section className="opus-embed-panel">
        <p className="opus-hint">
          Active generations from the home-server editor. Autopilot keeps clipping in the
          background even if you never open this page.
        </p>
        {loadError ? (
          <div className="opus-alert" role="alert">
            {loadError}
          </div>
        ) : null}

        {!canEmbed ? (
          <div className="opus-panel" role="status">
            <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Editor unavailable</h2>
            <p className="opus-hint" style={{ marginTop: "0.5rem" }}>
              Funnel URL or auth secret is missing, so the clips dashboard can&apos;t be
              embedded yet.
            </p>
            <p style={{ marginTop: "1rem" }}>
              <a className="opus-secondary" href={tailscaleUi} target="_blank" rel="noreferrer">
                Open clips list
              </a>
            </p>
          </div>
        ) : (
          <iframe
            className="opus-embed-frame"
            src={embedUrl}
            title="SupoClip clips"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </section>
    </SiteShell>
  );
}
