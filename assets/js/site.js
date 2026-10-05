/* Daywon Detailing shared behavior: booking mode, nav, contact fill, small page touches. */
(function () {
  var config = window.SITE_CONFIG || {};
  var booking = config.booking || { mode: "quote", external: {} };
  var contact = config.contact || {};
  var data = function () { return window.SITE_DATA || { services: [] }; };

  function getBookingMode() {
    var mode = booking.mode;
    if (mode === "quote") return { mode: "quote" };
    var ext = booking.external || {};
    if (mode && Object.prototype.hasOwnProperty.call(ext, mode)) {
      return { mode: mode, label: ext[mode].label, url: ext[mode].url };
    }
    if (typeof console !== "undefined") console.warn('Unknown booking mode "' + mode + '"; using "quote".');
    return { mode: "quote" };
  }

  function findService(id) {
    var list = data().services || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function setExternal(a, url) {
    a.setAttribute("href", url);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
  }
  function setInternal(a, href) {
    a.setAttribute("href", href);
    a.removeAttribute("target");
    a.removeAttribute("rel");
  }
  function remember(el, attr) {
    if (!el.hasAttribute(attr)) el.setAttribute(attr, el.textContent);
    return el.getAttribute(attr);
  }

  function applyBookingMode(root) {
    root = root || document;
    var m = getBookingMode();
    var external = m.mode !== "quote";

    root.querySelectorAll("[data-cta]").forEach(function (a) {
      var original = remember(a, "data-orig-text");
      if (external) { setExternal(a, m.url); a.textContent = m.label; }
      else { setInternal(a, "quote.html"); a.textContent = original; }
    });

    root.querySelectorAll("[data-cta-service]").forEach(function (a) {
      var id = a.getAttribute("data-cta-service");
      var original = remember(a, "data-orig-text");
      if (external) {
        var s = findService(id);
        var url = (s && s.bookingUrls && s.bookingUrls[m.mode]) || m.url;
        setExternal(a, url);
        a.textContent = a.getAttribute("data-label-external") || m.label;
      } else {
        setInternal(a, "quote.html?service=" + encodeURIComponent(id));
        a.textContent = original;
      }
    });

    root.querySelectorAll("[data-mode-text]").forEach(function (el) {
      var q = el.getAttribute("data-quote") || "";
      el.textContent = el.getAttribute("data-" + m.mode) || q;
    });
  }

  window.SITE = { getBookingMode: getBookingMode, applyBookingMode: applyBookingMode, config: config };

  var root = document.documentElement;
  root.classList.add("js");
  if (!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    root.classList.add("js-motion");
  }

  function fillContact() {
    var text = {
      phone: contact.phoneDisplay,
      email: contact.email,
      instagram: contact.instagram ? "@" + contact.instagram : "",
      tiktok: contact.tiktok ? "@" + contact.tiktok : ""
    };
    document.querySelectorAll("[data-contact]").forEach(function (el) {
      var v = text[el.getAttribute("data-contact")];
      if (v) el.textContent = v;
    });
    var href = {
      tel: contact.phoneE164 && "tel:" + contact.phoneE164,
      sms: contact.phoneE164 && "sms:" + contact.phoneE164,
      mailto: contact.email && "mailto:" + contact.email,
      instagram: contact.instagram && "https://www.instagram.com/" + contact.instagram + "/",
      tiktok: contact.tiktok && "https://www.tiktok.com/@" + contact.tiktok
    };
    document.querySelectorAll("[data-contact-href]").forEach(function (el) {
      var v = href[el.getAttribute("data-contact-href")];
      if (v) el.setAttribute("href", v);
    });
  }

  function setupNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("mobile-nav");
    if (!toggle || !nav) return;
    var use = toggle.querySelector("use");
    function set(open, returnFocus) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      nav.hidden = !open;
      if (use) use.setAttribute("href", open ? "#i-close" : "#i-menu");
      if (!open && returnFocus) toggle.focus();
    }
    toggle.addEventListener("click", function () {
      set(toggle.getAttribute("aria-expanded") !== "true", false);
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) set(false, true);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") set(false, true);
    });
  }

  function setupHeader() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    function onScroll() { header.classList.toggle("is-scrolled", window.scrollY > 8); }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function init() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
    fillContact();
    setupNav();
    setupHeader();
    applyBookingMode(document);

    var title = document.querySelector(".hero__title");
    if (title) {
      var go = function () { title.classList.add("is-sheen"); };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go);
      else window.addEventListener("load", go);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
