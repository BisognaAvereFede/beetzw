(function () {
  const $ = (s) => document.querySelector(s);

  // ---- Analyzer ----
  const drop = $("#drop"), fileInput = $("#file"), anStatus = $("#an-status");
  let bpm = 0;

  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) runAnalysis(f);
  });
  fileInput.addEventListener("change", () => fileInput.files[0] && runAnalysis(fileInput.files[0]));

  async function runAnalysis(file) {
    anStatus.classList.remove("err");
    $("#result").hidden = true;
    $("#pulse").classList.remove("beat");
    try {
      const res = await window.BeetzwAnalyzer.analyze(await file.arrayBuffer(), (m) => (anStatus.textContent = m));
      anStatus.textContent = "";
      $("#an-file").textContent = file.name;
      setBpm(res.bpm);
      $("#key").textContent = res.key.name;
      $("#camelot").textContent = res.key.camelot;
      $("#alt").textContent = res.confidence < 0.08
        ? `${res.key.long} · oppure ${res.alt.name} (${res.alt.camelot})`
        : res.key.long;
      renderChroma(res);
      const player = $("#player");
      if (player.src) URL.revokeObjectURL(player.src);
      player.src = URL.createObjectURL(file);
      $("#result").hidden = false;
    } catch (e) {
      console.error(e);
      anStatus.textContent = "Non riesco a leggere questo file. Prova con un MP3 o un WAV.";
      anStatus.classList.add("err");
    }
  }

  function setBpm(v) {
    bpm = v;
    $("#bpm").textContent = Number.isInteger(v) ? v : v.toFixed(1);
    const p = $("#pulse");
    p.style.setProperty("--period", 60 / v + "s");
    p.classList.remove("beat"); void p.offsetWidth; p.classList.add("beat");
  }
  $("#half").addEventListener("click", () => bpm && setBpm(Math.round((bpm / 2) * 10) / 10));
  $("#double").addEventListener("click", () => bpm && setBpm(Math.round(bpm * 2 * 10) / 10));

  function renderChroma(res) {
    const el = $("#chroma");
    el.innerHTML = "";
    res.chroma.forEach((v, i) => {
      const col = document.createElement("div");
      const bar = document.createElement("b");
      bar.style.height = "0%";
      if (res.inScale.has(i)) bar.classList.add("in");
      const lab = document.createElement("span");
      lab.textContent = res.notes[i];
      col.append(bar, lab);
      el.append(col);
      requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.height = Math.max(4, v * 100) + "%")));
    });
  }

  // File appena scaricato dal downloader.
  if (new URLSearchParams(location.search).get("da") === "download") {
    history.replaceState(null, "", location.pathname);
    window.BeetzwHandoff.take().then((f) => f && runAnalysis(f)).catch(() => {});
  }
})();
