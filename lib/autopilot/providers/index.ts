import { supoclipProvider } from "./supoclip";
import type { ClipProviderAdapter, ClipProviderName } from "./types";
import { wayinvideoProvider } from "./wayinvideo";

const providers: Record<ClipProviderName, ClipProviderAdapter> = {
  wayinvideo: wayinvideoProvider,
  supoclip: supoclipProvider
};

export function getClipProvider(name: string | undefined | null): ClipProviderAdapter {
  if (name === "wayinvideo") {
    return providers.wayinvideo;
  }
  return providers.supoclip;
}

export type { ClipProviderAdapter, ClipProviderName, ProviderClip } from "./types";
