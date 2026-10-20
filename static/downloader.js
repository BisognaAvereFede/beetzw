(function () {
  const $ = (s) => document.querySelector(s);

  // ---- Downloader ----
  const PATTERNS = {
    youtube: /(youtube\.com|youtu\.be)/i,
    spotify: /open\.spotify\.com/i,
    tiktok: /tiktok\.com/i,
    instagram: /instagram\.com/i,
  };
  const LABEL = { mp3: "MP3", wav: "WAV", mp4: "MP4" };
  const url = $("#url"), form = $("#dl-form"), btn = $("#dl-btn"), status = $("#dl-status");
  const platformsEl = document.querySelector(".platforms");
  const mp4 = form.querySelector('input[value="mp4"]');
  let lastBlob = null, lastName = "", infoTimer, infoFor = "";

  // In locale le API sono sullo stesso server; online (GitHub Pages) su Render.
  const API = document.body.dataset.api || "";

  async function api(path, body) {
    let r;
    try {
      r = await fetch(API + path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error("Il server di Beetzw non risponde. Riprova tra qualche secondo.");
    }
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || "Il server di Beetzw ha avuto un problema (errore " + r.status + "). Riprova.");
    }
    return r;
  }

  // Il server gratuito si addormenta: lo svegliamo appena si apre la pagina.
  let awake = !API;
  if (API) {
    const slow = setTimeout(() => {
      if (!awake) setStatus("Sto avviando il server, la prima volta può volerci fino a un minuto…");
    }, 2500);
    fetch(API + "/api/health").then(() => {
      awake = true;
      clearTimeout(slow);
      if (status.textContent.startsWith("Sto avviando")) setStatus("");
    }).catch(() => clearTimeout(slow));
  }

  const fmt = () => form.querySelector('input[name="format"]:checked').value;
  const setStatus = (msg, err) => { status.textContent = msg; status.classList.toggle("err", !!err); };

  function detect(v) {
    return Object.keys(PATTERNS).find((k) => PATTERNS[k].test(v)) || null;
  }

  function onUrl() {
    const p = detect(url.value);
    platformsEl.classList.toggle("matched", !!p);
    platformsEl.querySelectorAll("li").forEach((li) => li.classList.toggle("on", li.dataset.p === p));
    mp4.disabled = p === "spotify";
    if (mp4.disabled && mp4.checked) form.querySelector('input[value="mp3"]').checked = true;
    updateBtn();
    clearTimeout(infoTimer);
    if (p && url.value !== infoFor) infoTimer = setTimeout(loadInfo, 450);
    if (!p) $("#preview").hidden = true;
  }

  async function loadInfo() {
    const v = url.value.trim();
    infoFor = v;
    setStatus("Leggo il link…");
    try {
      const d = await (await api("/api/info", { url: v })).json();
      if (v !== url.value.trim()) return;
      $("#pv-thumb").src = d.thumbnail || "";
      $("#pv-thumb").hidden = !d.thumbnail;
      $("#pv-title").textContent = d.title;
      const bits = [d.artist, d.duration ? mmss(d.duration) : ""].filter(Boolean);
      $("#pv-meta").textContent = bits.join(" · ") + (d.platform === "spotify" ? " · cercato su YouTube" : "");
      $("#preview").hidden = false;
      setStatus("");
    } catch (e) {
      $("#preview").hidden = true;
      setStatus(e.message || "Non riesco a leggere il link.", true);
    }
  }

  function updateBtn() { btn.textContent = "Scarica " + LABEL[fmt()]; }

  url.addEventListener("input", onUrl);
  form.addEventListener("change", updateBtn);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (btn.getAttribute("aria-busy") === "true") return;
    if (!detect(url.value)) {
      setStatus("Incolla un link di YouTube, Spotify, TikTok o Instagram.", true);
      return;
    }
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "Scarico…";
    $("#dl-analyze").hidden = true;
    setStatus("Può volerci un po' per i file lunghi o in WAV.");
    try {
      const r = await api("/api/download", { url: url.value.trim(), format: fmt() });
      const blob = await r.blob();
      const name = filename(r.headers.get("Content-Disposition")) || "beetzw." + fmt();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      lastBlob = blob; lastName = name;
      $("#dl-analyze").hidden = fmt() === "mp4";
      setStatus("Scaricato: " + name);
    } catch (err) {
      setStatus(err.message || "Download non riuscito.", true);
    } finally {
      btn.removeAttribute("aria-busy");
      updateBtn();
    }
  });

  // Passa il file alla pagina Key & BPM senza doverlo ricaricare a mano.
  $("#dl-analyze").addEventListener("click", async () => {
    if (!lastBlob) return;
    try {
      await window.BeetzwHandoff.put(new File([lastBlob], lastName, { type: lastBlob.type }));
      location.href = document.body.dataset.keyBpmUrl + "?da=download";
    } catch (e) {
      setStatus("Non riesco a passare il file: aprilo da Key & BPM.", true);
    }
  });

  function filename(cd) {
    if (!cd) return "";
    const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
    if (star) return decodeURIComponent(star[1]);
    const plain = cd.match(/filename="?([^";]+)"?/i);
    return plain ? plain[1] : "";
  }
  const mmss = (s) => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
})();
