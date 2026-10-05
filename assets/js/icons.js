/* Daywon Detailing icon sprite. Inserts a hidden SVG sprite as the first child of <body>.
   Use: <svg class="icon" aria-hidden="true"><use href="#i-check"/></svg> */
(function () {
  var G = '<g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">';
  var icons = {
    'i-check': '<path pathLength="24" d="M5 12.5l4.5 4.5L19 7.5"/>',
    'i-arrow-right': '<path d="M4 12h16M14 6l6 6-6 6"/>',
    'i-phone': '<path d="M5 4h3.5l1.8 4.6-2.2 1.4a11 11 0 005.9 5.9l1.4-2.2L20 15.5V19a2 2 0 01-2.2 2A16 16 0 013 6.2 2 2 0 015 4z"/>',
    'i-message': '<path d="M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-8l-5 4v-4H5a2 2 0 01-2-2V6a2 2 0 012-2z"/>',
    'i-mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7.5L12 13.5l8.5-6"/>',
    'i-instagram': '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    'i-tiktok': '<path d="M14 3.5v10.8a3.7 3.7 0 11-3.7-3.7M14 3.5c.3 2.6 2.1 4.4 5 4.6"/>',
    'i-facebook': '<path d="M14 21v-8h3l.5-3.5H14V7.6c0-1 .5-1.6 1.6-1.6h1.9V3.1A22 22 0 0015.1 3C12.6 3 10.5 4.5 10.5 7.2v2.3h-3V13h3v8"/>',
    'i-pin': '<path d="M12 21s7-6 7-11.5a7 7 0 00-14 0C5 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    'i-clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'i-menu': '<path d="M4 7h16M4 12h16M4 17h16"/>',
    'i-close': '<path d="M6 6l12 12M18 6L6 18"/>',
    'i-sparkle': '<path fill="currentColor" stroke="none" d="M12 2Q13 11 22 12Q13 13 12 22Q11 13 2 12Q11 11 12 2z"/>',
    'i-alert': '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V13M12 16.5h.01"/>',
    'i-spinner': '<path d="M12 3a9 9 0 019 9"/>',
    'i-chevron-down': '<path d="M6 9l6 6 6-6"/>',
    'i-inbox': '<path d="M3 13l2.5-8h13L21 13v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
    'i-calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    'i-users': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 4.7a3.5 3.5 0 010 6.6M18 14.2a6.5 6.5 0 013.5 5.8"/>',
    'i-settings': '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    'i-send': '<path d="M21 3L10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5 21 3z"/>',
    'i-logout': '<path d="M10 4H6a2 2 0 00-2 2v12a2 2 0 002 2h4M15 8l4 4-4 4M19 12H9"/>',
    'i-map': '<path d="M9 4L3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4zM9 4v13M15 7v13"/>',
    'i-car': '<path d="M4 16v-4l2-5h12l2 5v4M4 12h16"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
    'i-chevron-left': '<path d="M15 6l-6 6 6 6"/>',
    'i-chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'i-plus': '<path d="M12 5v14M5 12h14"/>',
    'i-trash': '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    'i-edit': '<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4zM13.5 6.5l4 4"/>'
  };

  function build() {
    var html = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true" focusable="false">';
    Object.keys(icons).forEach(function (id) {
      html += '<symbol id="' + id + '" viewBox="0 0 24 24">' + G + icons[id] + '</g></symbol>';
    });
    html += '</svg>';
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.insertBefore(wrap.firstChild, document.body.firstChild);
  }

  if (document.body) { build(); }
  else { document.addEventListener('DOMContentLoaded', build); }
})();
