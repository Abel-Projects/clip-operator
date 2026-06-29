import { Suspense } from "react";
import ClipWorkbench from "../clip/clip-workbench";

export const dynamic = "force-dynamic";

export default function WorkbenchPage() {
  return (
    <Suspense
      fallback={
        <main className="opus-page">
          <p className="opus-hint">Loading…</p>
        </main>
      }
    >
      <ClipWorkbench />
    </Suspense>
  );
}
