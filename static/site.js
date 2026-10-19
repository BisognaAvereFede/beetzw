// Comportamenti comuni a tutte le pagine: tema, header, footer e passaggio
// di un file dal downloader alla pagina Key & BPM.
(function () {
  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;

  // ---- Tema chiaro / scuro ----
  const toggle = $(".theme-toggle");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const current = () => root.dataset.theme || (systemDark.matches ? "dark" : "light");

  function paintToggle() {
    const mode = current();
    toggle.dataset.mode = mode;
    toggle.setAttribute("aria-label", mode === "dark" ? "Attiva tema chiaro" : "Attiva tema scuro");
  }
  toggle.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("beetzw-theme", next); } catch (e) {}
    paintToggle();
  });
  systemDark.addEventListener("change", paintToggle);
  paintToggle();

  // ---- Header: bordo quando si scorre ----
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---- Hero: forma d'onda dimostrativa ----
  const wave = $(".demo-wave");
  if (wave) {
    for (let i = 0; i < 56; i++) {
      const bar = document.createElement("i");
      const h = 0.25 + 0.75 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21 + 1));
      bar.style.height = Math.round(h * 100) + "%";
      if (i < 22) bar.classList.add("played");
      wave.append(bar);
    }
  }

  // ---- Footer: il meter si accende quando entra in vista ----
  const word = $(".foot-word");
  if (word && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { word.classList.add("live"); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(word);
  }

  // ---- Passaggio file tra pagine (IndexedDB, resta nel browser) ----
  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("beetzw", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handoff");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction("handoff", mode);
      const out = fn(t.objectStore("handoff"));
      t.oncomplete = () => resolve(out && out.result);
      t.onerror = () => reject(t.error);
    });
  }
  window.BeetzwHandoff = {
    put: (file) => tx("readwrite", (s) => s.put(file, "file")),
    async take() {
      const file = await tx("readonly", (s) => s.get("file"));
      await tx("readwrite", (s) => s.delete("file"));
      return file || null;
    },
  };
})();
