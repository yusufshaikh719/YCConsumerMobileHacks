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
  const hint = document.querySelector(".hint");
  const prevBtn = document.querySelector(".nav-btn.prev");
  const nextBtn = document.querySelector(".nav-btn.next");
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pad = n => String(n).padStart(2, "0");
  let current = -1;
  let token = 0;
  let ticker = null;

  function fit() {
    const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
    stage.style.setProperty("--s", scale.toFixed(5));
  }

  function splitWords(el) {
    let index = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parts = node.textContent.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); continue; }
        const outer = document.createElement("span");
        outer.className = "w";
        const inner = document.createElement("span");
        inner.textContent = part;
        outer.appendChild(inner);
        outer.style.setProperty("--w", index++);
        frag.appendChild(outer);
      }
      node.parentNode.replaceChild(frag, node);
    }
    el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
  }

  function format(el, value, done) {
    if (done) return el.dataset.count;
    return value.toFixed(Number(el.dataset.dec || 0));
  }

  function lockWidth(el) {
    el.style.display = "inline-block";
    el.style.textAlign = "right";
    el.textContent = format(el, Number(el.dataset.count), false);
    const w = el.offsetWidth;
    el.textContent = format(el, 0, true);
    el.style.minWidth = w + "px";
  }

  function countUp(el, delay, myToken) {
    const to = Number(el.dataset.count);
    if (reduceQuery.matches) { el.textContent = format(el, to, true); return; }
    el.textContent = format(el, 0, false);
    const duration = 1700;
    let start = null;
    const step = now => {
      if (myToken !== token) return;
      if (start === null) start = now + delay;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = format(el, to * eased, t === 1);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function startCountdown(el, myToken) {
    let left = Number(el.dataset.countdown);
    const show = () => { el.textContent = Math.floor(left / 60) + ":" + pad(left % 60); };
    show();
    if (reduceQuery.matches) return;
    ticker = setInterval(() => {
      if (myToken !== token) return;
      left = left > 0 ? left - 1 : Number(el.dataset.countdown);
      show();
    }, 1000);
  }

  function revealDelay(el) {
    const host = el.closest("[data-r]");
    const d = host ? Number(host.style.getPropertyValue("--d") || 0) : 0;
    return 380 + d * 110 + 150;
  }

  function go(target) {
    const next = Math.max(0, Math.min(slides.length - 1, target));
    if (next === current) return;
    current = next;
    token++;
    clearInterval(ticker);
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === current);
      slide.classList.toggle("is-past", i < current);
      slide.setAttribute("aria-hidden", i === current ? "false" : "true");
    });
    const slide = slides[current];
    body.dataset.theme = slide.dataset.theme || "light";
    bar.parentElement.style.setProperty("--p", ((current + 1) / slides.length).toFixed(4));
    bar.style.transform = "scaleX(" + ((current + 1) / slides.length) + ")";
    counterNow.textContent = pad(current + 1);
    chapter.textContent = slide.dataset.chapter || "";
    prevBtn.disabled = current === 0;
    nextBtn.disabled = current === slides.length - 1;
    slide.querySelectorAll("[data-count]").forEach(el => countUp(el, revealDelay(el), token));
    slide.querySelectorAll("[data-countdown]").forEach(el => startCountdown(el, token));
    if (history.replaceState) history.replaceState(null, "", "#" + (current + 1));
  }

  const nextSlide = () => { go(current + 1); dismissHint(); };
  const prevSlide = () => { go(current - 1); dismissHint(); };
  function dismissHint() { if (current > 0) hint.classList.add("gone"); }

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
    }
  });

  let down = null;
  window.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.target.closest(".nav")) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
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
    slides.forEach(slide => {
      slide.querySelectorAll("[data-r], .split").forEach((el, i) => el.style.setProperty("--d", i));
    });
    document.querySelectorAll("[data-count]").forEach(lockWidth);
    counterTotal.textContent = pad(slides.length);
    const fromHash = parseInt(location.hash.slice(1), 10);
    requestAnimationFrame(() => requestAnimationFrame(() => go(fromHash ? fromHash - 1 : 0)));
  }

  fit();
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(init, init);
})();
