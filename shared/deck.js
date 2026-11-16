/* Shared deck engine.
   Keys: ← → Space PageUp/PageDown (clicker) · N notes · F full screen · Home/End.
   A slide may carry data-hook="name"; register behaviour with Deck.on("name", { enter, leave, step }).
   Elements with data-step="1..n" are revealed one key press at a time before the deck moves on. */
(() => {
  const stage = document.getElementById("stage");
  const slides = [...stage.querySelectorAll(".slide")];
  const hooks = {};
  const ID = document.documentElement.dataset.deck || "deck";
  let cur = -1, step = 0, t0 = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(ID + ":" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(ID + ":" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };

  /* chrome */
  document.body.insertAdjacentHTML("beforeend", `
    <div class="progress" id="dkProgress"></div>
    <div class="notes-panel" id="dkNotes" hidden><b>Speaker notes · N to hide</b><span></span></div>
    <nav class="bar" aria-label="Slide controls">
      <button type="button" id="dkTime" title="Elapsed time. Click to reset">00:00</button>
      <button type="button" id="dkPrev" aria-label="Previous">←</button>
      <span class="count" id="dkCount"></span>
      <button type="button" id="dkNext" aria-label="Next">→</button>
      <button type="button" id="dkN">Notes</button>
      <button type="button" id="dkF">Full screen</button>
    </nav>`);
  const notesPanel = $("#dkNotes");

  const maxStep = s => Math.max(0, ...$$("[data-step]", s).map(e => +e.dataset.step));
  function fit() {
    if (matchMedia("print").matches) return;
    const k = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(-50%,-50%) scale(${k})`;
  }
  function paintSteps() {
    const s = slides[cur];
    $$("[data-step]", s).forEach(e => e.classList.toggle("on", +e.dataset.step <= step));
    const h = hooks[s.dataset.hook];
    if (h && h.step) h.step(s, step);
  }
  function go(i, atEnd) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === cur) return;
    if (cur >= 0) {
      const old = slides[cur]; old.classList.remove("active");
      const h = hooks[old.dataset.hook]; if (h && h.leave) h.leave(old);
    }
    cur = i; const s = slides[cur];
    step = atEnd ? maxStep(s) : 0;
    s.classList.add("active");
    const h = hooks[s.dataset.hook]; if (h && h.enter) h.enter(s);
    paintSteps();
    $("#dkCount").textContent = `${cur + 1} / ${slides.length}`;
    $("#dkProgress").style.width = ((cur + 1) / slides.length * 100) + "%";
    const n = $(".notes", s); $("span", notesPanel).textContent = n ? n.textContent : "";
    history.replaceState(null, "", "#s" + (cur + 1));
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
  function next() { if (t0 == null) t0 = Date.now(); if (step < maxStep(slides[cur])) { step++; paintSteps(); } else go(cur + 1); }
  function prev() { if (step > 0) { step--; paintSteps(); } else go(cur - 1, true); }
  function toggleNotes() { notesPanel.hidden = !notesPanel.hidden; $("#dkN").setAttribute("aria-pressed", String(!notesPanel.hidden)); }
  function full() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); }

  addEventListener("keydown", e => {
    const t = e.target, tag = t.tagName;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) { if (e.key === "Escape") t.blur(); return; }
    if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    const k = e.key;
    if (k === "ArrowRight" || k === " " || k === "PageDown") { e.preventDefault(); next(); }
    else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); prev(); }
    else if (k === "Home") go(0);
    else if (k === "End") go(slides.length - 1);
    else if (k === "n" || k === "N") toggleNotes();
    else if (k === "f" || k === "F") full();
  });
  $("#dkPrev").onclick = prev; $("#dkNext").onclick = next; $("#dkN").onclick = toggleNotes; $("#dkF").onclick = full;
  $("#dkTime").onclick = () => { t0 = Date.now(); };
  setInterval(() => {
    const s = t0 == null ? 0 : Math.floor((Date.now() - t0) / 1000);
    $("#dkTime").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 1000);
  addEventListener("resize", fit);
  addEventListener("hashchange", () => { const m = /^#s(\d+)$/.exec(location.hash); if (m) go(+m[1] - 1); });

  /* editable text that survives a reload */
  $$("[data-edit]").forEach(el => {
    el.contentEditable = "plaintext-only"; el.spellcheck = false; el.classList.add("edit");
    const saved = store.get("edit:" + el.dataset.edit, null);
    if (saved != null) el.textContent = saved;
    el.addEventListener("input", () => store.set("edit:" + el.dataset.edit, el.textContent));
  });

  /* segmented controls: <div class="seg" data-seg="name"><button data-v="a">…</button>…</div> */
  function seg(root, onChange) {
    const btns = $$("button", root);
    const set = v => { btns.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v))); onChange(v); };
    btns.forEach(b => b.addEventListener("click", () => set(b.dataset.v)));
    return set;
  }
  /* pointer position in an element's own coordinate system (canvas pixels or SVG viewBox units) */
  function pt(e, el) {
    const r = el.getBoundingClientRect();
    const w = el.width && el.width.baseVal ? el.viewBox.baseVal.width : el.width || r.width;
    const h = el.height && el.height.baseVal ? el.viewBox.baseVal.height : el.height || r.height;
    return { x: (e.clientX - r.left) * w / r.width, y: (e.clientY - r.top) * h / r.height };
  }
  /* animation loop that only runs while its slide is showing */
  function loop(fn) {
    let id = 0, last = 0;
    const tick = t => { const dt = Math.min(50, t - (last || t)); last = t; fn(t, dt); id = requestAnimationFrame(tick); };
    return { start() { if (!id) { last = 0; id = requestAnimationFrame(tick); } }, stop() { cancelAnimationFrame(id); id = 0; } };
  }
  const css = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

  window.Deck = {
    on(name, h) { hooks[name] = h; }, $, $$, store, seg, pt, loop, css,
    get index() { return cur; },
    start() { fit(); const m = /^#s(\d+)$/.exec(location.hash); go(m ? +m[1] - 1 : 0); }
  };
})();
