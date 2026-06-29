import { Suspense } from "react";
import AutopilotDashboard from "./autopilot-dashboard";

export const dynamic = "force-dynamic";

export default function AutopilotPage() {
  return (
    <Suspense
      fallback={
        <main className="opus-page">
          <p className="opus-hint">Loading…</p>
        </main>
      }
    >
      <AutopilotDashboard />
    </Suspense>
  );
}
