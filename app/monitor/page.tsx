import { Suspense } from "react";
import MonitorDashboard from "./monitor-dashboard";

export const dynamic = "force-dynamic";

export default function MonitorPage() {
  return (
    <Suspense
      fallback={
        <main className="opus-page">
          <p className="opus-hint">Loading…</p>
        </main>
      }
    >
      <MonitorDashboard />
    </Suspense>
  );
}
