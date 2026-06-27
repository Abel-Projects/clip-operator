import { Suspense } from "react";
import ClipWorkbench from "./clip/clip-workbench";

export default function HomePage() {
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
