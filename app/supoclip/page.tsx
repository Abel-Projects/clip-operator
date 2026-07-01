import { Suspense } from "react";
import { getSupoClipIntegrationStatus } from "@/lib/supoclip";
import SupoClipEmbed from "./supoclip-embed";

export const dynamic = "force-dynamic";

export default async function SupoClipPage() {
  const status = await getSupoClipIntegrationStatus();

  return (
    <Suspense
      fallback={
        <main className="opus-page">
          <p className="opus-hint">Loading SupoClip…</p>
        </main>
      }
    >
      <SupoClipEmbed
        canEmbed={status.canEmbed}
        backendReachable={status.backendReachable}
        frontendUrl={status.frontendUrl}
      />
    </Suspense>
  );
}
