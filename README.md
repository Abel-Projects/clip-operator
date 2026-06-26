# Clip Operator

Chat-first starter for a source-to-clips-to-post workflow.

## What it does

- Lets you talk to a single AI interface
- Accepts a source URL or upload placeholder
- Runs locally without keys
- Uses OpenAI when `OPENAI_API_KEY` is present
- Has OpusClip adapter stubs for clip creation and posting

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

## Environment

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4.1-mini
OPUSCLIP_API_KEY=your_opusclip_key
OPUSCLIP_API_BASE_URL=https://your-opusclip-api-base-url
```

## Notes

- The OpusClip integration is scaffolded as an adapter so we can wire the exact API fields next.
- Posting should only go to accounts you own or are authorized to manage.
