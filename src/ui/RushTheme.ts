import '@fontsource/barlow-condensed/latin-600-italic.css';
import '@fontsource/barlow-condensed/latin-800-italic.css';

/**
 * The premium look for every Rush screen (ADR-0013): frosted dark glass, hairline borders, a
 * condensed italic display face for numbers and titles, and a neutral grotesque for reading.
 *
 * The screens were first built in a sticker-and-ink cartoon style, and their layout rules are
 * still theirs. This sheet restyles surfaces only (type, colour, borders, shadows) and is scoped
 * under `body.rush #rush-hud`, which outranks every `#rush-hud …` rule, so it wins regardless of
 * the order the screens inject their styles. The comic strips keep their comic style on purpose.
 */
const CSS = /* css */ `
body.rush #rush-hud {
  --t-text: #f3f4f7; --t-muted: rgba(243,244,247,0.66); --t-faint: rgba(243,244,247,0.14);
  --t-glass: rgba(13,15,23,0.6); --t-glass-strong: rgba(13,15,23,0.82); --t-hair: rgba(255,255,255,0.12);
  --t-accent: #ff5a36; --t-accent-2: #ff8a3d; --t-gold: #ffc23d; --t-ok: #3ddc84; --t-bad: #ff6b7a;
  --t-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 10px 32px rgba(4,6,14,0.38);
  --t-display: 'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif;
  --t-body: 'Space Grotesk Variable', 'Segoe UI', system-ui, sans-serif;
  font-family: var(--t-display); font-style: italic; font-weight: 600; letter-spacing: 0.02em; color: var(--t-text);
}
body.rush #rush-hud * { -webkit-text-stroke: 0 !important; }
body.rush #rush-hud .toon { text-shadow: 0 2px 14px rgba(4,6,14,0.5), 0 1px 2px rgba(4,6,14,0.6); }

/* Reading text: upright, never condensed. */
body.rush #rush-hud p, body.rush #rush-hud small, body.rush #rush-hud .tagline, body.rush #rush-hud li,
body.rush #rush-hud .hints, body.rush #rush-hud .goalline, body.rush #rush-hud .secretline, body.rush #rush-hud .why,
body.rush #rush-hud .medal-hint, body.rush #rush-hud .share-note, body.rush #rush-hud .motto {
  font-family: var(--t-body); font-style: normal; font-weight: 500; letter-spacing: 0;
}

/* Surfaces: one glass recipe for every panel and card. */
body.rush #rush-hud .card:not(.title), body.rush #rush-hud .control, body.rush #rush-hud .stat,
body.rush #rush-hud .lesson, body.rush #rush-hud .map .guardian, body.rush #rush-hud .map .info,
body.rush #rush-hud .item-card, body.rush #rush-hud .lanes, body.rush #rush-hud .item .slot {
  background: var(--t-glass); color: var(--t-text); border: 1px solid var(--t-hair); box-shadow: var(--t-shadow);
  -webkit-backdrop-filter: blur(18px) saturate(1.3); backdrop-filter: blur(18px) saturate(1.3);
}
body.rush #rush-hud .card:not(.title) { background: var(--t-glass-strong); border-radius: 20px; }
body.rush #rush-hud .control, body.rush #rush-hud .stat, body.rush #rush-hud .item-card { border-radius: 12px; }
body.rush #rush-hud .item .slot { border-radius: 14px; }
body.rush #rush-hud .item .slot.empty { background: rgba(13,15,23,0.35); }
body.rush #rush-hud .item-card.equipped { border-color: var(--t-ok); box-shadow: 0 0 0 1px var(--t-ok), var(--t-shadow); }
body.rush #rush-hud h1, body.rush #rush-hud h2, body.rush #rush-hud h3, body.rush #rush-hud b { font-weight: 800; }
body.rush #rush-hud .control h3, body.rush #rush-hud .garagecard h3 {
  font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; font-size: 14px; color: var(--t-muted);
}
body.rush #rush-hud .control p, body.rush #rush-hud .item-card p { color: var(--t-text); opacity: 0.85; }
body.rush #rush-hud .stat small { color: var(--t-muted); opacity: 1; text-transform: uppercase; letter-spacing: 0.08em; }

/* Title and headline type. */
body.rush #rush-hud .logo { color: var(--t-text); font-weight: 800; letter-spacing: -0.01em; text-transform: uppercase; }
body.rush #rush-hud .logo span { color: var(--t-accent); }
body.rush #rush-hud .title .logo { font-size: clamp(48px, min(11vw, 13vh), 112px); line-height: 0.86; }
body.rush #rush-hud .title .tagline { font-family: var(--t-body); font-weight: 500; text-shadow: 0 1px 10px rgba(4,6,14,0.6); }
body.rush #rush-hud .score { font-weight: 800; font-size: clamp(40px, 6.5vw, 64px); font-variant-numeric: tabular-nums; }
body.rush #rush-hud .sub { font-variant-numeric: tabular-nums; }
body.rush #rush-hud .banner b { color: var(--t-gold); font-weight: 800; text-transform: uppercase; letter-spacing: 0.01em; }
body.rush #rush-hud .banner small { color: var(--t-text); text-transform: uppercase; letter-spacing: 0.2em; font-size: 14px; }
body.rush #rush-hud .combo { color: var(--t-gold); font-weight: 800; }
body.rush #rush-hud .record { color: var(--t-gold); }
body.rush #rush-hud .coin-icon, body.rush #rush-hud .garagecard .bank i {
  background: radial-gradient(circle at 35% 30%, #fff1b8, #ffc23d 55%, #d18a00); box-shadow: 0 1px 3px rgba(0,0,0,0.4);
}
body.rush #rush-hud .garagecard .bank { color: var(--t-gold); }

/* Buttons: glass at rest, accent when primary; every state drawn. */
body.rush #rush-hud .btn, body.rush #rush-hud .chip, body.rush #rush-hud .school-link, body.rush #rush-hud .garage button {
  font-family: var(--t-display); font-style: italic; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  background: var(--t-glass); color: var(--t-text); border: 1px solid var(--t-hair); box-shadow: var(--t-shadow);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  transition: background 0.16s ease-out, border-color 0.16s ease-out, transform 0.12s ease-out;
}
body.rush #rush-hud .btn { border-radius: 10px; }
body.rush #rush-hud .btn:hover, body.rush #rush-hud .chip:hover, body.rush #rush-hud .school-link:hover, body.rush #rush-hud .garage button:hover {
  background: rgba(40,44,58,0.72); border-color: rgba(255,255,255,0.28); transform: none;
}
body.rush #rush-hud .btn:active, body.rush #rush-hud .chip:active, body.rush #rush-hud .school-link:active, body.rush #rush-hud .garage button:active {
  transform: scale(0.98); box-shadow: var(--t-shadow);
}
body.rush #rush-hud .btn.primary {
  background: linear-gradient(100deg, var(--t-accent), var(--t-accent-2)); border-color: rgba(255,255,255,0.22); color: #fff;
  box-shadow: 0 8px 28px rgba(255,90,54,0.35), 0 1px 0 rgba(255,255,255,0.25) inset;
}
body.rush #rush-hud .btn.primary:hover { filter: brightness(1.08); background: linear-gradient(100deg, var(--t-accent), var(--t-accent-2)); }
body.rush #rush-hud .btn[disabled] { opacity: 0.45; cursor: not-allowed; }
body.rush #rush-hud .btn:focus-visible, body.rush #rush-hud .chip:focus-visible, body.rush #rush-hud .school-link:focus-visible,
body.rush #rush-hud .garage button:focus-visible, body.rush #rush-hud .map .node:focus-visible {
  outline: 2px solid var(--t-gold); outline-offset: 3px;
}
body.rush #rush-hud .menu .btn { min-width: 280px; font-size: 22px; padding: 11px 22px; }
body.rush #rush-hud kbd, body.rush #rush-hud .key {
  font-family: var(--t-body); font-style: normal; font-weight: 600; font-size: 11px; letter-spacing: 0.04em;
  padding: 2px 6px; border-radius: 5px; background: var(--t-faint); color: var(--t-text);
  border: 1px solid var(--t-hair); box-shadow: none;
}
body.rush #rush-hud .btn.primary kbd { background: rgba(0,0,0,0.22); }
body.rush #rush-hud .muted, body.rush #rush-hud .goal {
  font-family: var(--t-body); font-style: normal; font-weight: 600; background: var(--t-glass); color: var(--t-text);
  border: 1px solid var(--t-hair); box-shadow: none;
}
body.rush #rush-hud .goal.ok { background: rgba(61,220,132,0.28); border-color: var(--t-ok); }
body.rush #rush-hud .goal.bad { background: rgba(255,107,122,0.28); border-color: var(--t-bad); }

/* Meters: thin, rounded, no rings. */
body.rush #rush-hud .nitro .track, body.rush #rush-hud .stagebar .track, body.rush #rush-hud .bossbar .hp,
body.rush #rush-hud .lesson .bar {
  height: 8px; border-radius: 4px; background: var(--t-faint); box-shadow: 0 0 0 1px var(--t-hair);
}
body.rush #rush-hud .nitro .fill { border-radius: 4px; background: linear-gradient(90deg, #2f8fff, #62e0ff); box-shadow: 0 0 12px rgba(98,224,255,0.6); }
body.rush #rush-hud .nitro.active .fill { background: linear-gradient(90deg, #ff5a36, #ffc23d); box-shadow: 0 0 14px rgba(255,138,61,0.7); }
body.rush #rush-hud .nitro .label { color: var(--t-text); letter-spacing: 0.14em; font-size: 14px; }
body.rush #rush-hud .stagebar .track b, body.rush #rush-hud .lanes b { box-shadow: 0 0 0 2px #fff, 0 0 10px rgba(255,79,216,0.7); }
body.rush #rush-hud .lanes i { background: var(--t-faint); }
body.rush #rush-hud .item-card .lv span { background: var(--t-faint); box-shadow: none; }
body.rush #rush-hud .item-card .lv span.on { background: var(--t-ok); }
body.rush #rush-hud .item-card .why { color: var(--t-muted); }
body.rush #rush-hud .lesson .problem { color: var(--t-bad); }
body.rush #rush-hud .star path { stroke: rgba(255,255,255,0.35); fill: rgba(255,255,255,0.12); }
body.rush #rush-hud .star.on path { fill: var(--t-gold); stroke: #fff3c4; }

/* Aim: a fine reticle, not a sticker. */
body.rush #rush-hud .crosshair { border: 2px solid rgba(255,255,255,0.9); box-shadow: 0 0 0 1px rgba(4,6,14,0.45), 0 0 12px rgba(4,6,14,0.3); }
body.rush #rush-hud .crosshair::after { width: 4px; height: 4px; margin: -2px 0 0 -2px; box-shadow: 0 0 0 1px rgba(4,6,14,0.5); }
body.rush #rush-hud .crosshair.locked { border-color: #ff4fd8; }

/* World map. */
body.rush #rush-hud .map .node {
  font-family: var(--t-display); background: var(--t-glass); color: var(--t-text);
  border: 2px solid rgba(255,255,255,0.3); box-shadow: var(--t-shadow);
}
body.rush #rush-hud .map .node.boss { background: rgba(255,90,54,0.75); }
body.rush #rush-hud .map .node.secret { background: rgba(155,107,255,0.75); }
body.rush #rush-hud .map .node.locked { background: rgba(13,15,23,0.45); color: var(--t-muted); }
body.rush #rush-hud .map .tab[aria-current="true"] { background: var(--t-accent); border-color: transparent; }
body.rush #rush-hud .map .guardian .face { box-shadow: 0 0 0 2px rgba(255,255,255,0.3); }
body.rush #rush-hud .map .guardian b { font-family: var(--t-display); font-weight: 800; }
body.rush #rush-hud .map .motto { color: var(--t-muted); }
body.rush #rush-hud .worlds span { box-shadow: none; border: 1px solid var(--t-hair); font-family: var(--t-body); font-style: normal; font-weight: 600; }
body.rush #rush-hud .medal { box-shadow: 0 0 0 2px rgba(255,255,255,0.35), 0 10px 26px rgba(0,0,0,0.4); }
`;

let installed = false;

/** Adds the theme once; safe to call from every screen that wants it. */
export function installRushTheme(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const style = document.createElement('style');
  style.dataset.rush = 'theme';
  style.textContent = CSS;
  document.head.appendChild(style);
}
