export type CampaignStatus =
  | "pending"
  | "clipping"
  | "scheduling"
  | "active"
  | "done"
  | "failed";

export type PostStatus = "queued" | "posting" | "posted" | "failed";

export type AutopilotSettingsRow = {
  id: number;
  niche: string;
  max_clips_per_source: number;
  posts_per_day: number;
  min_hours_between_posts: number;
  min_clip_score: number;
  timezone: string;
  enabled: boolean;
  updated_at: string;
};

export type CampaignRow = {
  id: string;
  source_url: string;
  niche: string;
  opus_project_id: string | null;
  status: CampaignStatus;
  error_message: string | null;
  poll_count: number;
  created_at: string;
  updated_at: string;
};

export type CampaignClipRow = {
  id: string;
  campaign_id: string;
  opus_clip_id: string;
  title: string | null;
  score: number | null;
  duration_sec: number | null;
  preview_url: string | null;
  rank: number;
  selected: boolean;
};

export type ScheduledPostRow = {
  id: string;
  campaign_id: string;
  campaign_clip_id: string;
  opus_project_id: string;
  opus_clip_id: string;
  scheduled_at: string;
  posted_at: string | null;
  status: PostStatus;
  caption_title: string | null;
  caption_description: string | null;
  error_message: string | null;
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
          opus_project_id?: string | null;
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
          opus_clip_id: string;
          title?: string | null;
          score?: number | null;
          duration_sec?: number | null;
          preview_url?: string | null;
          rank?: number;
          selected?: boolean;
        };
        Update: Partial<CampaignClipRow>;
      };
      scheduled_posts: {
        Row: ScheduledPostRow;
        Insert: {
          campaign_id: string;
          campaign_clip_id: string;
          opus_project_id: string;
          opus_clip_id: string;
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
