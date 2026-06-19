/* Verbify — original hand-drawn icon set (replaces emoji).
   Each icon is bespoke inline SVG in the notebook ink style.
   Usage:  ICON.flame()         → 1em inline icon
           ICON.trophy('54px')  → sized icon
   data-icon="flame" attributes in HTML are filled by fillIcons(). */
(function () {
  function ic(inner, size) {
    size = size || "1em";
    return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">${inner}</svg>`;
  }
  const ICON = {
    flame: (s) => ic(
      `<path d="M12 2.2c2.6 3 4.6 5.3 4.6 8.6A4.6 4.6 0 0 1 7.4 11c0-1.2.4-2.1 1.1-3 .3 1 .9 1.6 1.7 1.8C9.5 7.4 10.4 5 12 2.2z" fill="#ff8a4c" stroke="#b8453a" stroke-width="1.3" stroke-linejoin="round"/>
       <path d="M12 11.4c1.4 1.3 2.1 2.4 2.1 3.6a2.1 2.1 0 1 1-4.2 0c0-.7.3-1.3.8-1.8.1.5.5.8.9.8.5 0 .8-.5.4-1.2.4-.5 0-1 0-1.4z" fill="#ffce47"/>`, s),
    snow: (s) => ic(
      `<g stroke="#36608c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
         <path d="M12 2.5v19M3.8 7.25 20.2 16.75M20.2 7.25 3.8 16.75"/>
         <path d="M12 5.4 9.9 3.9M12 5.4 14.1 3.9M12 18.6 9.9 20.1M12 18.6 14.1 20.1"/>
         <path d="M5.6 8.1 4.7 5.9M5.6 8.1 7.8 7.7M18.4 15.9 19.3 18.1M18.4 15.9 16.2 16.3"/>
         <path d="M18.4 8.1 19.3 5.9M18.4 8.1 16.2 7.7M5.6 15.9 4.7 18.1M5.6 15.9 7.8 16.3"/>
       </g>`, s),
    vacation: (s) => ic(
      `<path d="M3.5 11c.4-3.8 4-6.5 8.5-6.5S20.1 7.2 20.5 11H3.5z" fill="#2fa58f" stroke="#1f7a6b" stroke-width="1.3" stroke-linejoin="round"/>
       <path d="M12 4.5V20a2 2 0 0 0 2-2" stroke="#1f7a6b" stroke-width="1.6" stroke-linecap="round"/>
       <path d="M8.3 11c.4-3 1.7-5.3 3.7-6.5M15.7 11c-.4-3-1.7-5.3-3.7-6.5" stroke="#1f7a6b" stroke-width=".9"/>`, s),
    trophy: (s) => ic(
      `<path d="M7.5 4.5h9V8a4.5 4.5 0 0 1-9 0V4.5z" fill="#ffd24d" stroke="#b8843a" stroke-width="1.3" stroke-linejoin="round"/>
       <path d="M7.5 5.5H5a2.5 2.5 0 0 0 2.8 3.4M16.5 5.5H19a2.5 2.5 0 0 1-2.8 3.4" stroke="#b8843a" stroke-width="1.3" stroke-linecap="round"/>
       <path d="M12 12.5v2.5M9 19.5h6l-.6-4.5h-4.8z" fill="#ffd24d" stroke="#b8843a" stroke-width="1.3" stroke-linejoin="round"/>`, s),
    brain: (s) => ic(
      `<g stroke="#b8537a" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
         <path d="M11.4 5.2C10.3 4 8.4 4.1 7.5 5.4c-1.7.1-2.5 1.9-1.6 3.3-1.3.8-1.2 2.8.3 3.4-.5 1.6 1 3 2.6 2.5.6.9 2 .9 2.6-.1V5.2z" fill="#fbe3ee"/>
         <path d="M12.6 5.2C13.7 4 15.6 4.1 16.5 5.4c1.7.1 2.5 1.9 1.6 3.3 1.3.8 1.2 2.8-.3 3.4.5 1.6-1 3-2.6 2.5-.6.9-2 .9-2.6-.1V5.2z" fill="#fbe3ee"/>
         <path d="M12 6.5v8M9.6 8.6c.9.2 1.4.9 1.4 1.8M14.4 10.8c-.9.2-1.4.8-1.4 1.7M10 15.5v2.5M14 15.5v2.5"/>
       </g>`, s),
    target: (s) => ic(
      `<circle cx="12" cy="12" r="9" stroke="#b8453a" stroke-width="1.7"/>
       <circle cx="12" cy="12" r="5" stroke="#b8453a" stroke-width="1.5"/>
       <circle cx="12" cy="12" r="1.7" fill="#b8453a"/>`, s),
    book: (s) => ic(
      `<path d="M12 6.2C9.9 5 7.4 4.8 5 5.3v12.4c2.4-.5 4.9-.3 7 .9 2.1-1.2 4.6-1.4 7-.9V5.3c-2.4-.5-4.9-.3-7 .9z" fill="#fffdf6" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
       <path d="M12 6.2v12.3" stroke="currentColor" stroke-width="1.2"/>`, s),
    bulb: (s) => ic(
      `<path d="M12 3.2A5.6 5.6 0 0 0 8 12.7c.8.8 1.2 1.5 1.4 2.4h5.2c.2-.9.6-1.6 1.4-2.4A5.6 5.6 0 0 0 12 3.2z" fill="#ffe89a" stroke="#b8843a" stroke-width="1.3" stroke-linejoin="round"/>
       <path d="M9.6 17.6h4.8M10.2 20h3.6" stroke="#b8843a" stroke-width="1.4" stroke-linecap="round"/>`, s),
    star: (s) => ic(
      `<path d="M12 3.2l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z" fill="#ffd24d" stroke="#b8843a" stroke-width="1.1" stroke-linejoin="round"/>`, s),
    gem: (s) => ic(
      `<path d="M7.2 4.5h9.6l3.2 4.6L12 20.5 4 9.1z" fill="#7fd0e6" stroke="#2c6e8a" stroke-width="1.2" stroke-linejoin="round"/>
       <path d="M4.2 9.1h15.6M9 4.6 7.3 9.1 12 20.4l4.7-11.3L15 4.6" stroke="#2c6e8a" stroke-width=".9"/>`, s),
    crown: (s) => ic(
      `<path d="M3.8 8.2l3.1 3 5.1-5.8 5.1 5.8 3.1-3-1.6 9.6H5.4z" fill="#ffd24d" stroke="#b8843a" stroke-width="1.3" stroke-linejoin="round"/>
       <path d="M5.6 17.6h12.8" stroke="#b8843a" stroke-width="1.3" stroke-linecap="round"/>
       <circle cx="3.8" cy="8.2" r="1.1" fill="#b8843a"/><circle cx="20.2" cy="8.2" r="1.1" fill="#b8843a"/>`, s),
    calendar: (s) => ic(
      `<rect x="4" y="5.2" width="16" height="14.6" rx="2" fill="#fffdf6" stroke="currentColor" stroke-width="1.5"/>
       <path d="M4 9.4h16M8 3.4v3.6M16 3.4v3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
       <path d="M7.5 12.8h2M11 12.8h2M14.5 12.8h2M7.5 16.2h2M11 16.2h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`, s),
    check: (s) => ic(
      `<path d="M4.5 12.5l4.5 4.5 10.5-11" stroke="#3a8a4f" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`, s),
    cross: (s) => ic(
      `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="#c0392b" stroke-width="2.6" stroke-linecap="round"/>`, s),
    speaker: (s) => ic(
      `<path d="M4 9h3l4-3.2v12.4L7 15H4z" fill="#36608c" stroke="#234a6e" stroke-width="1.1" stroke-linejoin="round"/>
       <path d="M14 9.2a3.2 3.2 0 0 1 0 5.6M16.4 7a6.2 6.2 0 0 1 0 10" stroke="#36608c" stroke-width="1.6" stroke-linecap="round"/>`, s),
    gear: (s) => ic(
      `<circle cx="12" cy="12" r="4.3" fill="#fffdf6" stroke="currentColor" stroke-width="1.6"/>
       <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v2.6M12 18.4V21M21 12h-2.6M5.6 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4 5.6 5.6"/></g>`, s),
    refresh: (s) => ic(
      `<path d="M5 12a7 7 0 0 1 12-4.9M19 12a7 7 0 0 1-12 4.9" stroke="#36608c" stroke-width="1.8" stroke-linecap="round"/>
       <path d="M17 3.6V7.4h-3.8M7 20.4v-3.8h3.8" stroke="#36608c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`, s),
    link: (s) => ic(
      `<path d="M9.5 14.5l5-5M8 12l-1.8 1.8a3 3 0 0 0 4.2 4.2L12.2 16M16 12l1.8-1.8a3 3 0 0 0-4.2-4.2L11.8 8" stroke="#2fa58f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`, s),
    bolt: (s) => ic(
      `<path d="M13 2.5 5.5 13H10l-1 8.5L18.5 10H13z" fill="#ffd24d" stroke="#b8843a" stroke-width="1.2" stroke-linejoin="round"/>`, s),
    clock: (s) => ic(
      `<circle cx="12" cy="13" r="8" fill="#fffdf6" stroke="#b8453a" stroke-width="1.7"/>
       <path d="M12 9v4.2l2.8 1.8" stroke="#b8453a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
       <path d="M9.5 3.4h5M12 3.4V5.2" stroke="#b8453a" stroke-width="1.7" stroke-linecap="round"/>`, s),
    sparkles: (s) => ic(
      `<path d="M11 3.2l1.5 4.1 4.1 1.5-4.1 1.5L11 14.4 9.5 10.3 5.4 8.8l4.1-1.5z" fill="#ffd24d" stroke="#b8843a" stroke-width=".9" stroke-linejoin="round"/>
       <path d="M17.5 13.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" fill="#ffce47"/>`, s),
  };
  function fillIcons(root) {
    (root || document).querySelectorAll("[data-icon]").forEach(el => {
      const fn = ICON[el.dataset.icon];
      if (fn) el.innerHTML = fn(el.dataset.size || "1em");
    });
  }
  window.ICON = ICON;
  window.fillIcons = fillIcons;
})();
