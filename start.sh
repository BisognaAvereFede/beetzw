#!/bin/sh
# Avvio su Render: server dei PO token in background, poi Beetzw.
node /pot/server/build/main.js &

# Render passa la porta in $PORT. Un solo processo con più thread
# per stare nei 512 MB del piano gratuito.
exec gunicorn app:app --bind 0.0.0.0:${PORT:-10000} --workers 1 --threads 4 --timeout 300
