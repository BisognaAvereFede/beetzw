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

## Versione online

- **Sito** (GitHub Pages): https://bisognaaverefede.github.io/beetzw/ — home, Key & BPM e la pagina del downloader.
- **Server del downloader** (Render, piano gratuito): `Dockerfile` + `render.yaml`, con yt-dlp, ffmpeg e deno.

`build.py` genera il sito statico in `_site/` usando gli stessi template, e
`.github/workflows/pages.yml` lo pubblica a ogni push su `main`.
Il downloader online chiama `https://beetzw-api.onrender.com`; se il server su Render ha un altro indirizzo,
impostalo in GitHub → Settings → Secrets and variables → Actions → Variables come `BEETZW_API`.

Limiti del server (variabili d'ambiente su Render):

| Variabile | Default | Cosa fa |
|---|---|---|
| `BEETZW_ORIGINS` | `https://bisognaaverefede.github.io` | domini che possono usare il server |
| `BEETZW_MAX_DURATION` | `900` | durata massima in secondi |
| `BEETZW_RATE_LIMIT` | `10` | download per IP ogni 10 minuti |
| `BEETZW_MAX_PARALLEL` | `2` | download contemporanei |

Il piano gratuito di Render va in pausa dopo 15 minuti senza richieste: la prima richiesta dopo la pausa
impiega 30–50 secondi (la pagina avvisa l'utente). YouTube a volte blocca i server cloud.
