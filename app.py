"""Beetzw — utils per produttori.

Backend minimale: riceve un link (YouTube, TikTok, Instagram, Spotify),
lo scarica con yt-dlp e restituisce il file. Key & BPM vengono calcolati
nel browser, quindi qui non c'è nulla per l'analisi audio.
"""

import html
import os
import re
import shutil
import tempfile
import threading
import time
import urllib.request
from collections import defaultdict, deque
from pathlib import Path

import certifi

# Python di python.org su macOS non trova i certificati di sistema.
os.environ.setdefault("SSL_CERT_FILE", certifi.where())

from flask import Flask, jsonify, render_template, request, send_file  # noqa: E402
import yt_dlp  # noqa: E402

app = Flask(__name__, static_folder="static", static_url_path="")

PLATFORMS = {
    "youtube": re.compile(r"(youtube\.com|youtu\.be|music\.youtube\.com)"),
    "spotify": re.compile(r"open\.spotify\.com/(intl-\w+/)?track/"),
    "tiktok": re.compile(r"(tiktok\.com|vm\.tiktok\.com)"),
    "instagram": re.compile(r"instagram\.com/(p|reel|reels|tv)/"),
}

FORMATS = {"mp3", "wav", "mp4"}

# Il sito su GitHub Pages chiama questo server da un altro dominio.
ALLOWED_ORIGINS = {
    o.strip() for o in os.environ.get(
        "BEETZW_ORIGINS",
        "https://bisognaaverefede.github.io,http://localhost:5174,http://127.0.0.1:5174",
    ).split(",") if o.strip()
}
# Limiti per non far esplodere un server gratuito (512 MB di RAM).
MAX_DURATION = int(os.environ.get("BEETZW_MAX_DURATION", 15 * 60))  # secondi
RATE_LIMIT = int(os.environ.get("BEETZW_RATE_LIMIT", 10))  # download per IP...
RATE_WINDOW = 10 * 60  # ...ogni 10 minuti
download_slots = threading.Semaphore(int(os.environ.get("BEETZW_MAX_PARALLEL", 2)))
recent = defaultdict(deque)
recent_lock = threading.Lock()
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


class UserError(Exception):
    pass


def detect_platform(url: str) -> str:
    for name, pattern in PLATFORMS.items():
        if pattern.search(url):
            return name
    if "open.spotify.com" in url:
        raise UserError("Da Spotify si possono scaricare solo singole tracce, non playlist o album.")
    raise UserError("Link non riconosciuto. Incolla un link di YouTube, Spotify, TikTok o Instagram.")


def spotify_to_search(url: str) -> tuple[str, dict]:
    """Spotify non permette il download diretto (DRM): leggiamo titolo e
    artista dalla pagina pubblica e cerchiamo lo stesso brano su YouTube."""
    # Con uno user-agent da browser Spotify serve una pagina JS senza meta tag.
    req = urllib.request.Request(url.split("?")[0], headers={"User-Agent": "curl/8.7.1"})
    try:
        page = urllib.request.urlopen(req, timeout=10).read().decode("utf-8", "ignore")
    except Exception as exc:
        raise UserError("Non riesco a leggere il link Spotify. Controlla che sia una traccia pubblica.") from exc

    def meta(prop):
        m = re.search(rf'<meta property="{prop}" content="([^"]*)"', page)
        return html.unescape(m.group(1)) if m else ""

    title = meta("og:title")
    desc = meta("og:description")  # es. "Artista · Canzone · Song · 2023"
    artist = desc.split(" · ")[0] if " · " in desc else ""
    if not title:
        raise UserError("Non trovo il titolo di questa traccia Spotify.")
    info = {"title": title, "artist": artist, "thumbnail": meta("og:image")}
    return f"ytsearch1:{artist} {title} audio", info


def ydl_opts(fmt: str, outdir: str) -> dict:
    opts = {
        "outtmpl": str(Path(outdir) / "%(title).120B.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "restrictfilenames": False,
        "http_headers": {"User-Agent": UA},
    }
    if fmt == "mp4":
        opts["format"] = "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b"
        opts["merge_output_format"] = "mp4"
    else:
        opts["format"] = "bestaudio/best"
        pp = {"key": "FFmpegExtractAudio", "preferredcodec": fmt}
        if fmt == "mp3":
            pp["preferredquality"] = "320"
        opts["postprocessors"] = [pp]
    return opts


def client_ip() -> str:
    # Su Render la richiesta passa da un proxy: il primo IP è quello reale.
    fwd = request.headers.get("X-Forwarded-For", "")
    return fwd.split(",")[0].strip() or request.remote_addr or "?"


def rate_limited(ip: str) -> bool:
    now = time.time()
    with recent_lock:
        q = recent[ip]
        while q and now - q[0] > RATE_WINDOW:
            q.popleft()
        if len(q) >= RATE_LIMIT:
            return True
        q.append(now)
        return False


def check_duration(info: dict):
    duration = info.get("duration")
    if duration and duration > MAX_DURATION:
        raise UserError(f"Il contenuto dura più di {MAX_DURATION // 60} minuti: scegline uno più corto.")


def first_entry(info: dict) -> dict:
    if info.get("_type") == "playlist" and info.get("entries"):
        return info["entries"][0]
    return info


@app.after_request
def cors(resp):
    origin = request.headers.get("Origin")
    if origin in ALLOWED_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Expose-Headers"] = "Content-Disposition"
        resp.headers["Vary"] = "Origin"
    return resp


# Gli stessi template servono anche per la versione statica (build.py),
# quindi link e asset passano da qui invece di essere scritti a mano.
@app.context_processor
def links():
    return {
        "url": {"home": "/", "downloader": "/downloader", "key_bpm": "/key-bpm"},
        "asset": lambda path: "/" + path,
        "static_site": False,
        "api_url": "",
    }


@app.get("/")
def home():
    return render_template("home.html", active="home")


@app.get("/downloader")
def downloader():
    return render_template("downloader.html", active="downloader")


@app.get("/key-bpm")
def key_bpm():
    return render_template("key_bpm.html", active="key-bpm")


@app.get("/api/health")
def api_health():
    # Il sito lo chiama all'apertura per svegliare il server gratuito.
    return jsonify(ok=True)


@app.post("/api/info")
def api_info():
    url = (request.json or {}).get("url", "").strip()
    try:
        platform = detect_platform(url)
        if platform == "spotify":
            _, meta = spotify_to_search(url)
            return jsonify(platform=platform, **meta, duration=None)
        with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "noplaylist": True,
                               "http_headers": {"User-Agent": UA}}) as ydl:
            info = first_entry(ydl.extract_info(url, download=False))
        return jsonify(
            platform=platform,
            title=info.get("title") or "Senza titolo",
            artist=info.get("uploader") or info.get("channel") or "",
            thumbnail=info.get("thumbnail"),
            duration=info.get("duration"),
        )
    except UserError as e:
        return jsonify(error=str(e)), 400
    except yt_dlp.utils.DownloadError as e:
        return jsonify(error=friendly(e)), 400


@app.post("/api/download")
def api_download():
    body = request.json or {}
    url = body.get("url", "").strip()
    fmt = body.get("format", "mp3")
    if fmt not in FORMATS:
        return jsonify(error="Formato non supportato."), 400

    if rate_limited(client_ip()):
        return jsonify(error="Hai fatto molti download di fila: riprova tra qualche minuto."), 429
    if not download_slots.acquire(blocking=False):
        return jsonify(error="Il server è occupato con altri download: riprova tra poco."), 503

    tmp = tempfile.mkdtemp(prefix="beetzw-")
    try:
        platform = detect_platform(url)
        target = url
        if platform == "spotify":
            if fmt == "mp4":
                raise UserError("Spotify è solo audio: scegli MP3 o WAV.")
            target, _ = spotify_to_search(url)
        with yt_dlp.YoutubeDL(ydl_opts(fmt, tmp)) as ydl:
            info = first_entry(ydl.extract_info(target, download=False))
            check_duration(info)
            ydl.process_ie_result(info, download=True)
        files = [p for p in Path(tmp).iterdir() if p.suffix.lstrip(".") == fmt]
        if not files:
            raise UserError("Download completato ma il file non è stato creato. ffmpeg è installato?")
        path = files[0]
        resp = send_file(path, as_attachment=True, download_name=path.name)
        resp.call_on_close(lambda: shutil.rmtree(tmp, ignore_errors=True))
        return resp
    except UserError as e:
        shutil.rmtree(tmp, ignore_errors=True)
        return jsonify(error=str(e)), 400
    except yt_dlp.utils.DownloadError as e:
        shutil.rmtree(tmp, ignore_errors=True)
        return jsonify(error=friendly(e)), 400
    finally:
        download_slots.release()


def friendly(e: Exception) -> str:
    msg = str(e)
    if "login" in msg.lower() or "private" in msg.lower():
        return "Questo contenuto è privato o richiede il login."
    if "not a bot" in msg.lower() or "sign in to confirm" in msg.lower():
        return "YouTube ha bloccato il server di Beetzw. Riprova più tardi o usa un altro link."
    if "unavailable" in msg.lower():
        return "Contenuto non disponibile."
    return "Download non riuscito: " + re.sub(r"^ERROR:\s*", "", msg)[:200]


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5173, debug=False)
