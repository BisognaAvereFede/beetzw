"""Genera la versione statica di Beetzw per GitHub Pages in _site/.

Usa gli stessi template di app.py. Le pagine sono statiche; il downloader
chiama il server Python ospitato su Render (vedi render.yaml), mentre
Key & BPM gira tutto nel browser.

    python3 build.py
"""

import os
import shutil
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).parent
OUT = ROOT / "_site"

# Su GitHub Actions GITHUB_REPOSITORY vale "utente/repo".
REPO = os.environ.get("GITHUB_REPOSITORY", "")
REPO_URL = f"https://github.com/{REPO}" if REPO else "https://github.com"
# Server del downloader (Render). Si cambia con la variabile BEETZW_API.
API_URL = (os.environ.get("BEETZW_API") or "https://beetzw-api.onrender.com").rstrip("/")

PAGES = {
    "index.html": ("home.html", "home"),
    "downloader.html": ("downloader.html", "downloader"),
    "key-bpm.html": ("key_bpm.html", "key-bpm"),
}


def main():
    env = Environment(
        loader=FileSystemLoader(ROOT / "templates"),
        autoescape=select_autoescape(["html"]),
    )
    # Link relativi: il sito funziona anche sotto utente.github.io/repo/.
    context = {
        "url": {"home": "./", "downloader": "downloader.html", "key_bpm": "key-bpm.html"},
        "asset": lambda path: path,
        "static_site": True,
        "repo_url": REPO_URL,
        "api_url": API_URL,
    }

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(ROOT / "static", OUT)

    for out_name, (template, active) in PAGES.items():
        html = env.get_template(template).render(active=active, **context)
        (OUT / out_name).write_text(html, encoding="utf-8")

    # Senza questo file GitHub Pages passerebbe tutto per Jekyll.
    (OUT / ".nojekyll").touch()
    print(f"Sito generato in {OUT}")


if __name__ == "__main__":
    main()
