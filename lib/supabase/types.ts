export type CampaignStatus =
  | "pending"
  | "clipping"
  | "scheduling"
  | "active"
  | "done"
  | "failed";

export type PostStatus = "queued" | "posting" | "posted" | "failed";

export type ClipProviderName = "wayinvideo" | "supoclip";

export type AutopilotSettingsRow = {
  id: number;
  niche: string;
  clip_provider: ClipProviderName;
  max_clips_per_source: number;
  posts_per_day: number;
  min_hours_between_posts: number;
  min_clip_score: number;
  winner_min_views: number;
  timezone: string;
  enabled: boolean;
  sources_per_day: number;
  min_source_duration_min: number;
  max_source_duration_min: number;
  auto_approve_sources: boolean;
  discovery_keywords: string[] | unknown;
  discovery_channels: string[] | unknown;
  updated_at: string;
};

export type SuggestionStatus = "pending" | "approved" | "rejected";

export type ContentSuggestionRow = {
  id: string;
  video_id: string;
  url: string;
  title: string | null;
  channel_title: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
  score: number;
  status: SuggestionStatus;
  created_at: string;
  updated_at: string;
};

export type CampaignRow = {
  id: string;
  source_url: string;
  niche: string;
  clip_provider: ClipProviderName;
  provider_project_id: string | null;
  status: CampaignStatus;
  error_message: string | null;
  poll_count: number;
  created_at: string;
  updated_at: string;
};

export type CampaignClipRow = {
  id: string;
  campaign_id: string;
  provider_clip_id: string;
  title: string | null;
  score: number | null;
  duration_sec: number | null;
  preview_url: string | null;
  rank: number;
  selected: boolean;
};

export type SystemHeartbeatRow = {
  name: string;
  last_seen_at: string;
  detail: string | null;
  updated_at: string;
};

export type ScheduledPostRow = {
  id: string;
  campaign_id: string;
  campaign_clip_id: string;
  provider_project_id: string;
  provider_clip_id: string;
  scheduled_at: string;
  posted_at: string | null;
  status: PostStatus;
  caption_title: string | null;
  caption_description: string | null;
  error_message: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  metrics_synced_at: string | null;
  tiktok_url: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      autopilot_settings: {
        Row: AutopilotSettingsRow;
        Insert: Partial<AutopilotSettingsRow> & { id?: number };
        Update: Partial<AutopilotSettingsRow>;
      };
      campaigns: {
        Row: CampaignRow;
        Insert: {
          source_url: string;
          niche?: string;
          clip_provider?: ClipProviderName;
          provider_project_id?: string | null;
          status?: CampaignStatus;
          error_message?: string | null;
          poll_count?: number;
        };
        Update: Partial<CampaignRow>;
      };
      campaign_clips: {
        Row: CampaignClipRow;
        Insert: {
          campaign_id: string;
          provider_clip_id: string;
          title?: string | null;
          score?: number | null;
          duration_sec?: number | null;
          preview_url?: string | null;
          rank?: number;
          selected?: boolean;
        };
        Update: Partial<CampaignClipRow>;
      };
      content_suggestions: {
        Row: ContentSuggestionRow;
        Insert: {
          video_id: string;
          url: string;
          title?: string | null;
          channel_title?: string | null;
          duration_sec?: number | null;
          thumbnail_url?: string | null;
          score?: number;
          status?: SuggestionStatus;
        };
        Update: Partial<ContentSuggestionRow>;
      };
      system_heartbeats: {
        Row: SystemHeartbeatRow;
        Insert: {
          name: string;
          last_seen_at?: string;
          detail?: string | null;
          updated_at?: string;
        };
        Update: Partial<SystemHeartbeatRow>;
      };
      scheduled_posts: {
        Row: ScheduledPostRow;
        Insert: {
          campaign_id: string;
          campaign_clip_id: string;
          provider_project_id: string;
          provider_clip_id: string;
          scheduled_at: string;
          posted_at?: string | null;
          status?: PostStatus;
          caption_title?: string | null;
          caption_description?: string | null;
          error_message?: string | null;
        };
        Update: Partial<ScheduledPostRow>;
      };
    };
  };
};
