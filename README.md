# Beetzw

Utils per produttori: downloader (YouTube, Spotify, TikTok, Instagram) e key & BPM finder.

## Avvio

Serve Python 3 e ffmpeg (`brew install ffmpeg`).

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Poi apri http://127.0.0.1:5173

## Struttura

- `templates/base.html`: header (con il pulsante tema chiaro/scuro) e footer comuni
- `templates/home.html`: home con hero, strumenti, come funziona e FAQ
- `templates/downloader.html` → `/downloader`
- `templates/key_bpm.html` → `/key-bpm`
- `static/site.js`: tema, header, footer e passaggio del file scaricato alla pagina Key & BPM
- `static/downloader.js`, `static/keybpm.js`, `static/analyzer.js`: logica degli strumenti

La dark mode segue il sistema finché non si sceglie un tema con il pulsante nell'header (la scelta resta salvata nel browser).

## Come funziona

- **Downloader** (`app.py`): usa yt-dlp + ffmpeg. MP3 a 320k, WAV, oppure MP4 video.
  Spotify è protetto da DRM: Beetzw legge titolo e artista della traccia e scarica lo stesso brano da YouTube.
  Alcuni post Instagram richiedono il login e non sono scaricabili.
- **Key & BPM** (`static/analyzer.js`): gira tutto nel browser, il file non viene caricato da nessuna parte.
  Analizza fino a 2 minuti di audio; se il BPM esce dimezzato o doppio usa i tasti ÷2 / ×2.
- Se i download smettono di funzionare, aggiorna yt-dlp: `.venv/bin/pip install -U yt-dlp`.

## Versione online (GitHub Pages)

GitHub Pages ospita solo file statici, quindi online ci sono la home e **Key & BPM** (che gira tutta nel browser).
La pagina Downloader online spiega come avviare Beetzw in locale, perché scaricare richiede il server Python.

- `build.py` genera il sito statico in `_site/` usando gli stessi template.
- `.github/workflows/pages.yml` lo ricostruisce e lo pubblica a ogni push su `main`.
- Una volta sola, nel repository su GitHub: **Settings → Pages → Source: GitHub Actions**.

Per provarlo in locale: `python3 build.py && python3 -m http.server --directory _site`.
