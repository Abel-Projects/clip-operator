export type ClipProviderName = "wayinvideo" | "supoclip";

export type ProviderClip = {
  clipId: string;
  title?: string;
  score?: number;
  durationSec?: number;
  previewUrl?: string;
  /** WayinVideo publish API uses numeric clip index. */
  publishIndex?: number;
};

export type StartProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; message: string };

export type FetchClipsResult =
  | { ok: true; clips: ProviderClip[]; processing: boolean; status: string }
  | { ok: false; message: string };

export type PublishClipResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export type ClipProviderAdapter = {
  name: ClipProviderName;
  label: string;
  startProject(
    videoUrl: string,
    options: { maxClips: number; projectName?: string }
  ): Promise<StartProjectResult>;
  getClips(projectId: string): Promise<FetchClipsResult>;
  publishClip(
    projectId: string,
    clip: ProviderClip,
    caption: { title: string; description: string }
  ): Promise<PublishClipResult>;
};
