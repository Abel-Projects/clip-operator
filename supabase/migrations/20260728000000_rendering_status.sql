-- Add 'rendering' status for lesson videos that need to be rendered before posting.

alter type post_status add value if not exists 'rendering' before 'queued';
