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
  const pad = n => String(n).padStart(2, "0");
  let current = -1;

  function fit() {
    stage.style.setProperty("--s", Math.min(window.innerWidth / W, window.innerHeight / H).toFixed(5));
  }

  function go(target) {
    const next = Math.max(0, Math.min(slides.length - 1, target));
    if (next === current) return;
    current = next;
    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === current);
      slide.setAttribute("aria-hidden", i === current ? "false" : "true");
    });
    const slide = slides[current];
    body.dataset.theme = slide.classList.contains("moss") ? "moss" : "paper";
    bar.style.transform = "scaleX(" + ((current + 1) / slides.length) + ")";
    counterNow.textContent = pad(current + 1);
    chapter.textContent = slide.dataset.chapter || "";
    notesPanel.textContent = slide.querySelector(".notes")?.textContent || "";
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

  prevBtn.addEventListener("click", prevSlide);
  nextBtn.addEventListener("click", nextSlide);
  window.addEventListener("resize", fit);
  window.addEventListener("hashchange", () => {
    const n = parseInt(location.hash.slice(1), 10);
    if (n) go(n - 1);
  });

  function init() {
    fit();
    slides.forEach(slide => slide.querySelectorAll("[data-r]").forEach((el, i) => el.style.setProperty("--d", i)));
    counterTotal.textContent = pad(slides.length);
    const fromHash = parseInt(location.hash.slice(1), 10);
    requestAnimationFrame(() => requestAnimationFrame(() => go(fromHash ? fromHash - 1 : 0)));
  }

  fit();
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(init, init);
})();
