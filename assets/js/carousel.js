/* Daywon Detailing: swipeable carousels (photos and videos). Works without JS as a plain scrolling row.
   Markup: .carousel > .carousel__track > .carousel__slide. Buttons and dots are added here. */
(function () {
  "use strict";
  function init(root) {
    var track = root.querySelector(".carousel__track");
    var slides = Array.prototype.slice.call(root.querySelectorAll(".carousel__slide"));
    if (!track || slides.length < 1) return;
    root.classList.add("is-enhanced");

    function mk(cls, label, html) {
      var b = document.createElement("button");
      b.type = "button"; b.className = cls; b.setAttribute("aria-label", label); b.innerHTML = html;
      return b;
    }
    var prev = mk("carousel__btn carousel__btn--prev", "Previous", '<svg class="icon" aria-hidden="true"><use href="#i-chevron-left"/></svg>');
    var next = mk("carousel__btn carousel__btn--next", "Next", '<svg class="icon" aria-hidden="true"><use href="#i-chevron-right"/></svg>');
    var dots = document.createElement("div");
    dots.className = "carousel__dots";
    var dotBtns = slides.map(function (s, i) {
      var d = mk("carousel__dot", "Go to " + (i + 1) + " of " + slides.length, "");
      d.addEventListener("click", function () { goTo(i); });
      dots.appendChild(d);
      return d;
    });
    root.appendChild(prev); root.appendChild(next); root.appendChild(dots);

    function step() { return slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : track.clientWidth; }
    function current() { return Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / (step() || 1)))); }
    function goTo(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      track.scrollTo({ left: slides[i].offsetLeft - slides[0].offsetLeft, behavior: reduce ? "auto" : "smooth" });
    }
    function paint() {
      var i = current(), atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      prev.disabled = track.scrollLeft <= 4;
      next.disabled = atEnd;
      dotBtns.forEach(function (d, k) { if (k === (atEnd ? slides.length - 1 : i)) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
    }
    prev.addEventListener("click", function () { goTo(current() - 1); });
    next.addEventListener("click", function () { goTo(current() + 1); });
    var t = null;
    track.addEventListener("scroll", function () { clearTimeout(t); t = setTimeout(paint, 60); }, { passive: true });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); goTo(current() + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(current() - 1); }
    });
    window.addEventListener("resize", paint);
    paint();

    /* Only one video plays at a time, and a video stops when it scrolls out of view. */
    var vids = root.querySelectorAll("video");
    vids.forEach(function (v) {
      v.addEventListener("play", function () {
        document.querySelectorAll(".carousel video").forEach(function (o) { if (o !== v) o.pause(); });
      });
    });
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (!en.isIntersecting && !en.target.paused) en.target.pause(); });
      }, { root: track, threshold: 0.4 });
      vids.forEach(function (v) { io.observe(v); });
    }
  }
  function boot() { document.querySelectorAll("[data-carousel]").forEach(init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();