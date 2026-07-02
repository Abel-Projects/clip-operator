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

type SupoClipEmbedProps = {
  frontendUrl: string;
  canEmbed: boolean;
  backendReachable: boolean;
};

export default function SupoClipEmbed({
  frontendUrl,
  canEmbed,
  backendReachable
}: SupoClipEmbedProps) {
  const [siteUnlocked, setSiteUnlocked] = useState(false);
  const [sitePassword, setSitePassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const handleUnlockSite = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setPasswordError("");

      const password = sitePassword.trim();
      if (!password) {
        return;
      }

      storeSitePassword(password);
      const response = await authFetch("/api/supoclip/config");
      if (response.status === 401) {
        clearSitePassword();
        setPasswordError("Wrong password.");
        return;
      }

      setSiteUnlocked(true);
    },
    [sitePassword]
  );

  useEffect(() => {
    const stored = getStoredSitePassword();
    if (!stored) {
      return;
    }

    setSitePassword(stored);
    void authFetch("/api/supoclip/config").then((response) => {
      if (response.status === 401) {
        clearSitePassword();
        return;
      }
      setSiteUnlocked(true);
    });
  }, []);

  if (!siteUnlocked) {
    return (
      <PasswordGate
        password={sitePassword}
        error={passwordError}
        onPasswordChange={setSitePassword}
        onSubmit={handleUnlockSite}
      />
    );
  }

  return (
    <SiteShell subtitle="SupoClip editor" back wide>
      <section className="opus-embed-panel">
        <p className="opus-hint">
          Full SupoClip editor on your home server. Clipping API is wired for autopilot;
          TikTok posts run via the home-server agent.
        </p>
        {!canEmbed ? (
          <div className="opus-alert" role="alert">
            Set <code>SUPOCLIP_FRONTEND_URL</code> and <code>SUPOCLIP_USER_ID</code> on
            Vercel to load the editor.
          </div>
        ) : (
          <>
            {!backendReachable ? (
              <div className="opus-alert" role="alert">
                SupoClip API tunnel may be down — autopilot clipping won&apos;t work until{" "}
                <code>SUPOCLIP_BASE_URL</code> is updated. The editor may still load below.
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
