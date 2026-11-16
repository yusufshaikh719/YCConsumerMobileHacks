(() => {
  "use strict";
  const W = 1920, H = 1080;
  const body = document.body;
  const stage = document.querySelector(".stage");
  const slides = Array.from(document.querySelectorAll(".slide"));
  const bar = document.querySelector(".progress i");
  const counterNow = document.querySelector(".counter b");
  const counterTotal = document.querySelector(".counter .total");
  const chapter = document.querySelector(".chapter");
  const notesPanel = document.querySelector(".notes-panel");
  const prevBtn = document.querySelector(".nav-btn.prev");
  const nextBtn = document.querySelector(".nav-btn.next");
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pad = n => String(n).padStart(2, "0");
  let current = -1;
  let token = 0;

  function splitWords(el) {
    const label = el.textContent.replace(/\s+/g, " ").trim();
    let index = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const frag = document.createDocumentFragment();
      for (const part of node.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); continue; }
        const outer = document.createElement("span");
        const inner = document.createElement("span");
        outer.className = "w";
        outer.style.setProperty("--w", index++);
        inner.textContent = part;
        outer.appendChild(inner);
        frag.appendChild(outer);
      }
      node.parentNode.replaceChild(frag, node);
    }
    el.setAttribute("aria-label", label);
  }

  function splitLetters(el) {
    const text = el.textContent.trim();
    el.textContent = "";
    [...text].forEach((ch, i) => {
      const c = document.createElement("span");
      c.className = "c";
      c.style.setProperty("--c", i);
      c.textContent = ch;
      el.appendChild(c);
    });
    el.setAttribute("aria-label", text);
  }

  function lockWidth(el) {
    el.style.display = "inline-block";
    el.style.textAlign = "right";
    el.style.minWidth = el.offsetWidth + "px";
  }

  function countUp(el, myToken) {
    const to = Number(el.dataset.count);
    const from = Number(el.dataset.from || 0);
    if (reduceQuery.matches) { el.textContent = to; return; }
    el.textContent = from;
    const host = el.closest("[data-r], .split, .rows, .stats .stat");
    const d = host ? Number(host.style.getPropertyValue("--d") || 0) : 0;
    const delay = 450 + d * 110 + Number(el.dataset.wait || 0);
    const duration = 1500;
    let start = null;
    const step = now => {
      if (myToken !== token) return;
      if (start === null) start = now + delay;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = Math.round(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function fit() {
    stage.style.setProperty("--s", Math.min(window.innerWidth / W, window.innerHeight / H).toFixed(5));
  }

  function go(target) {
    const next = Math.max(0, Math.min(slides.length - 1, target));
    if (next === current) return;
    current = next;
    token++;
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === current);
      slide.classList.toggle("is-past", i < current);
      slide.setAttribute("aria-hidden", i === current ? "false" : "true");
    });
    const slide = slides[current];
    body.dataset.theme = slide.classList.contains("moss") ? "moss" : "paper";
    bar.style.transform = "scaleX(" + ((current + 1) / slides.length) + ")";
    counterNow.textContent = pad(current + 1);
    chapter.textContent = slide.dataset.chapter || "";
    notesPanel.textContent = slide.querySelector(".notes")?.textContent || "";
    slide.querySelectorAll("[data-count]").forEach(el => countUp(el, token));
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === slides.length - 1;
    if (history.replaceState) history.replaceState(null, "", "#" + (current + 1));
  }

  const nextSlide = () => go(current + 1);
  const prevSlide = () => go(current - 1);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  document.addEventListener("keydown", e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": case "PageDown": case " ": case "Enter":
        e.preventDefault(); nextSlide(); break;
      case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace":
        e.preventDefault(); prevSlide(); break;
      case "Home": e.preventDefault(); go(0); break;
      case "End": e.preventDefault(); go(slides.length - 1); break;
      case "f": case "F": toggleFullscreen(); break;
      case "n": case "N": body.classList.toggle("show-notes"); break;
    }
  });

  let down = null;
  window.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.target.closest(".nav")) return;
    down = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("pointerup", e => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? nextSlide() : prevSlide(); return; }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) nextSlide();
  });
  window.addEventListener("pointercancel", () => { down = null; });

  let wheelLock = 0;
  window.addEventListener("wheel", e => {
    const now = performance.now();
    if (now < wheelLock || Math.abs(e.deltaY) + Math.abs(e.deltaX) < 24) return;
    wheelLock = now + 900;
    (e.deltaY || e.deltaX) > 0 ? nextSlide() : prevSlide();
  }, { passive: true });

  let frame = 0;
  window.addEventListener("pointermove", e => {
    if (reduceQuery.matches || e.pointerType === "touch") return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      body.style.setProperty("--px", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
      body.style.setProperty("--py", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
    });
  });

  prevBtn.addEventListener("click", prevSlide);
  nextBtn.addEventListener("click", nextSlide);
  window.addEventListener("resize", fit);
  window.addEventListener("hashchange", () => {
    const n = parseInt(location.hash.slice(1), 10);
    if (n) go(n - 1);
  });

  function init() {
    fit();
    document.querySelectorAll(".split").forEach(splitWords);
    document.querySelectorAll(".letters").forEach(splitLetters);
    document.querySelectorAll("[data-count]").forEach(lockWidth);
    slides.forEach(slide => {
      slide.querySelectorAll("[data-r], .split").forEach((el, i) => el.style.setProperty("--d", i));
      slide.querySelectorAll("[data-phone]").forEach((el, i) => el.style.setProperty("--p", i));
    });
    counterTotal.textContent = pad(slides.length);
    const fromHash = parseInt(location.hash.slice(1), 10);
    requestAnimationFrame(() => requestAnimationFrame(() => go(fromHash ? fromHash - 1 : 0)));
  }

  fit();
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(init, init);
})();
