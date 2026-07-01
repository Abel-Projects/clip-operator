import {
  createSupoClipProject,
  getSupoClipProjectClips
} from "@/lib/supoclip";
import type {
  ClipProviderAdapter,
  FetchClipsResult,
  PublishClipResult,
  StartProjectResult
} from "./types";

export const supoclipProvider: ClipProviderAdapter = {
  name: "supoclip",
  label: "SupoClip",

  async startProject(videoUrl, options): Promise<StartProjectResult> {
    const result = await createSupoClipProject({
      videoUrl,
      projectName: options.projectName,
      processingMode: "fast"
    });

    if (!result.ok) {
      return { ok: false, message: result.message };
    }

    return { ok: true, projectId: result.projectId };
  },

  async getClips(projectId): Promise<FetchClipsResult> {
    const result = await getSupoClipProjectClips(projectId);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }

    return {
      ok: true,
      clips: result.clips.map((clip) => ({
        clipId: clip.clipId,
        title: clip.title,
        score: clip.score,
        durationSec: clip.durationSec,
        previewUrl: clip.previewUrl
      })),
      processing: result.processing,
      status: result.status
    };
  },

  async publishClip(): Promise<PublishClipResult> {
    return {
      ok: false,
      message:
        "SupoClip posts are published by the home-server TikTok agent (see home-server/tiktok-publisher)."
    };
  }
};
