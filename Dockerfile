# Server del downloader per Render (o qualsiasi host con Docker).

# --- Server dei PO token per YouTube (bgutil-ytdlp-pot-provider) ---
# YouTube blocca i server cloud senza un "proof of origin" token:
# questo piccolo server Node li genera e il plugin di yt-dlp li usa.
FROM node:22.12.0-bookworm-slim AS pot
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch 2.0.2 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /pot
WORKDIR /pot/server
RUN npm ci --no-audit --no-fund && npx tsc && npm prune --omit=dev

# --- Beetzw ---
FROM python:3.12-slim-bookworm

# ffmpeg converte in MP3/WAV e unisce audio e video negli MP4.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp usa un runtime JavaScript per decifrare i video di YouTube.
COPY --from=denoland/deno:bin-2.1.4 /deno /usr/local/bin/deno
COPY --from=pot /usr/local/bin/node /usr/local/bin/node
COPY --from=pot /pot/server /pot/server

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

CMD ["sh", "start.sh"]
