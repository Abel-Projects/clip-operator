import { supoclipProvider } from "./supoclip";
import type { ClipProviderAdapter, ClipProviderName } from "./types";
import { wayinvideoProvider } from "./wayinvideo";

const providers: Record<ClipProviderName, ClipProviderAdapter> = {
  wayinvideo: wayinvideoProvider,
  supoclip: supoclipProvider
};

export function getClipProvider(name: string | undefined | null): ClipProviderAdapter {
  if (name === "supoclip") {
    return providers.supoclip;
  }
  return providers.wayinvideo;
}

export type { ClipProviderAdapter, ClipProviderName, ProviderClip } from "./types";
