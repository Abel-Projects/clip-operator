import {
  createWayinVideoProject,
  getWayinVideoProjectClips,
  publishWayinVideoClipToTikTok,
  type WayinVideoClip
} from "@/lib/wayinvideo";
import type {
  ClipProviderAdapter,
  FetchClipsResult,
  ProviderClip,
  PublishClipResult,
  StartProjectResult
} from "./types";

function toProviderClip(clip: WayinVideoClip): ProviderClip {
  return {
    clipId: clip.clipId,
    title: clip.title,
    score: clip.score,
    durationSec: clip.durationSec,
    previewUrl: clip.previewUrl ?? clip.thumbnailUrl,
    publishIndex: clip.idx
  };
}

export const wayinvideoProvider: ClipProviderAdapter = {
  name: "wayinvideo",
  label: "WayinVideo",

  async startProject(videoUrl, options): Promise<StartProjectResult> {
    const result = await createWayinVideoProject({
      videoUrl,
      projectName: options.projectName,
      targetDuration: "DURATION_0_90",
      limit: options.maxClips
    });

    if (!result.ok) {
      return { ok: false, message: result.message };
    }

    return { ok: true, projectId: result.projectId };
  },

  async getClips(projectId): Promise<FetchClipsResult> {
    const result = await getWayinVideoProjectClips(projectId);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }

    return {
      ok: true,
      clips: result.clips.map(toProviderClip),
      processing: result.processing,
      status: result.status
    };
  },

  async publishClip(projectId, clip, caption): Promise<PublishClipResult> {
    if (clip.publishIndex == null) {
      return { ok: false, message: "Missing WayinVideo clip index." };
    }

    const wayinClip: WayinVideoClip = {
      id: clip.clipId,
      clipId: clip.clipId,
      idx: clip.publishIndex,
      title: caption.title,
      description: caption.description
    };

    const result = await publishWayinVideoClipToTikTok({
      projectId,
      clip: wayinClip
    });

    return result.ok
      ? { ok: true, message: result.message }
      : { ok: false, message: result.message };
  }
};
