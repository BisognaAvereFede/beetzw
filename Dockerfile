# Server del downloader per Render (o qualsiasi host con Docker).
FROM python:3.12-slim

# ffmpeg converte in MP3/WAV e unisce audio e video negli MP4.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp usa un runtime JavaScript per decifrare i video di YouTube.
COPY --from=denoland/deno:bin-2.1.4 /deno /usr/local/bin/deno

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Render passa la porta in $PORT. Un solo processo con più thread
# per stare nei 512 MB del piano gratuito.
CMD gunicorn app:app --bind 0.0.0.0:${PORT:-10000} --workers 1 --threads 4 --timeout 300
