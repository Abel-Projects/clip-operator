# TikTok publisher agent — runs on the home server next to SupoClip.
FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /publisher

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY agent.py tiktok_upload.py tiktok_upload_fast.py setup-uploader.sh ./
RUN chmod +x setup-uploader.sh && ./setup-uploader.sh

COPY run-loop.sh ./
RUN chmod +x run-loop.sh

ENV POLL_INTERVAL_SEC=300
ENV CLIP_OPERATOR_URL=http://app:3000
ENV SUPOCLIP_BASE_URL=http://host.docker.internal:8000

CMD ["./run-loop.sh"]
