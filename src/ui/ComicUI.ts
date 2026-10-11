import type { Actor, Scene } from '../rush/Story';
import { TOUR } from '../rush/Tour';
import type { BiomeId } from '../rush/Zones';

/**
 * Plays a story scene as a three-panel comic strip.
 *
 * Every drawing is inline SVG in the game's style — round bean characters, thick ink outlines,
 * flat bright colours — so the comics look like the game rather than like pasted-in art.
 */

const SKY: Record<BiomeId, [string, string]> = {
  meadow: ['#3fa7ff', '#ffe2b8'],
  desert: ['#ff8a5c', '#ffd79a'],
  snow: ['#6fb2ff', '#e6f3ff'],
  candy: ['#ff8fd0', '#ffe3f3'],
  neon: ['#1b1150', '#6a3aa8'],
  beach: ['#2fc6ff', '#fff2c9']
};
const GROUND: Record<BiomeId, string> = {
  meadow: '#7fd95b', desert: '#f2c27b', snow: '#f4f8ff', candy: '#9ff0c9', neon: '#241d4d', beach: '#ffe3a3'
};
const GUARDIAN_COLOR = ['#ff8c3a', '#e8955a', '#2a2d4a', '#ff5fa8', '#2ec4b6', '#ff5a36'];

const INK = '#1d1b33';

function eyes(cx: number, cy: number, look = 0): string {
  return `<circle cx="${cx - 7}" cy="${cy}" r="5" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="${cx + 7}" cy="${cy}" r="5" fill="#fff" stroke="${INK}" stroke-width="2"/>
    <circle cx="${cx - 7 + look}" cy="${cy}" r="2.4" fill="${INK}"/><circle cx="${cx + 7 + look}" cy="${cy}" r="2.4" fill="${INK}"/>`;
}

/** A bean character: the shape every person in the game shares. */
function bean(x: number, color: string, hat: string, look = 0): string {
  return `<g transform="translate(${x} 0)">
    <rect x="-20" y="52" width="40" height="52" rx="20" fill="${color}" stroke="${INK}" stroke-width="3"/>
    ${eyes(0, 68, look)}
    <path d="M-7 82 Q0 88 7 82" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    ${hat}
  </g>`;
}

function actor(a: Actor, x: number, world: number): string {
  switch (a) {
    case 'driver':
      return bean(x, '#ffb27a', `<path d="M-20 60 A20 20 0 0 1 20 60 Z" fill="#3d8bff" stroke="${INK}" stroke-width="3"/><rect x="12" y="70" width="26" height="7" rx="3" fill="#ffd23f" stroke="${INK}" stroke-width="2"/>`, 2);
    case 'guardian': {
      const hats = [
        `<rect x="-26" y="50" width="52" height="5" rx="2" fill="#f2c94c" stroke="${INK}" stroke-width="2"/><rect x="-12" y="40" width="24" height="12" rx="4" fill="#f2c94c" stroke="${INK}" stroke-width="2"/>`,
        `<rect x="-28" y="50" width="56" height="5" rx="2" fill="#8a5a3a" stroke="${INK}" stroke-width="2"/><rect x="-12" y="36" width="24" height="16" rx="5" fill="#8a5a3a" stroke="${INK}" stroke-width="2"/>`,
        `<ellipse cx="0" cy="82" rx="12" ry="16" fill="#fff"/><path d="M-4 76 L0 82 L4 76 Z" fill="#ff9f1c"/>`,
        `<path d="M-12 54 L0 26 L12 54 Z" fill="#ff5fa8" stroke="${INK}" stroke-width="2"/><circle cx="0" cy="26" r="4" fill="#ffd23f"/>`,
        `<rect x="-20" y="62" width="40" height="8" rx="3" fill="#3ff7ff" stroke="${INK}" stroke-width="2"/>`,
        `<circle cx="-16" cy="54" r="7" fill="#ff5a36" stroke="${INK}" stroke-width="2"/><circle cx="16" cy="54" r="7" fill="#ff5a36" stroke="${INK}" stroke-width="2"/>`
      ];
      return bean(x, GUARDIAN_COLOR[world], hats[world], -2);
    }
    case 'baron':
      return `<g transform="translate(${x} 0)">
        <ellipse cx="0" cy="76" rx="26" ry="22" fill="#6a3aa8" stroke="${INK}" stroke-width="3"/>
        <path d="M-24 70 L24 70" stroke="${INK}" stroke-width="6"/><path d="M-22 84 L22 84" stroke="${INK}" stroke-width="6"/>
        <ellipse cx="-24" cy="52" rx="16" ry="8" fill="#e8f7ff" stroke="${INK}" stroke-width="2" transform="rotate(-20 -24 52)"/>
        <ellipse cx="24" cy="52" rx="16" ry="8" fill="#e8f7ff" stroke="${INK}" stroke-width="2" transform="rotate(20 24 52)"/>
        ${eyes(0, 72, 0)}<circle cx="7" cy="72" r="8" fill="none" stroke="#ffd23f" stroke-width="2.5"/>
        <rect x="-12" y="30" width="24" height="24" rx="3" fill="${INK}"/><rect x="-18" y="52" width="36" height="5" rx="2" fill="${INK}"/><rect x="-12" y="46" width="24" height="5" fill="#ff4d5e"/>
        <path d="M-8 86 Q0 80 8 86" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      </g>`;
    case 'drone':
    case 'boss': {
      const s = a === 'boss' ? 1.35 : 1;
      return `<g transform="translate(${x} ${a === 'boss' ? -18 : 0}) scale(${s})">
        <ellipse cx="0" cy="70" rx="30" ry="14" fill="#8e5cff" stroke="${INK}" stroke-width="3"/>
        <circle cx="0" cy="66" r="11" fill="#fff" stroke="${INK}" stroke-width="2.5"/><circle cx="0" cy="66" r="5" fill="${INK}"/>
        ${a === 'boss' ? `<path d="M-14 50 L-10 38 L-4 46 L0 34 L4 46 L10 38 L14 50 Z" fill="#ffd23f" stroke="${INK}" stroke-width="2"/>` : ''}
      </g>`;
    }
    case 'wheel':
      return `<g transform="translate(${x} 0)">
        <circle cx="0" cy="72" r="26" fill="none" stroke="#ffd23f" stroke-width="10"/><circle cx="0" cy="72" r="26" fill="none" stroke="${INK}" stroke-width="2"/>
        <circle cx="0" cy="72" r="8" fill="#ffd23f" stroke="${INK}" stroke-width="2"/>
        ${[0, 60, 120].map((r) => `<line x1="0" y1="50" x2="0" y2="94" stroke="#ffd23f" stroke-width="4" transform="rotate(${r} 0 72)"/>`).join('')}
        <path d="M-40 50 L-32 56 M40 50 L32 56 M0 34 L0 42" stroke="#fff3b0" stroke-width="3" stroke-linecap="round"/>
      </g>`;
    case 'crowd':
      return [-34, 0, 34].map((dx, i) => bean(x + dx, ['#9b6bff', '#5ad16b', '#ffd23f'][i], `<path d="M-14 58 L-22 42 M14 58 L22 42" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`)).join('');
  }
}

const CSS = /* css */ `
#rush-hud .comic { width: min(900px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow-y: auto; }
#rush-hud .comic h2 { font-size: clamp(26px, 4vw, 38px); }
#rush-hud .strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
#rush-hud .panel {
  position: relative; border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 4px var(--ink);
  animation: rush-in 0.45s cubic-bezier(.3,1.5,.5,1) both; background: #fff; text-align: left;
}
#rush-hud .panel:nth-child(2) { animation-delay: 0.35s; }
#rush-hud .panel:nth-child(3) { animation-delay: 0.7s; }
#rush-hud .panel svg { display: block; width: 100%; height: auto; }
#rush-hud .panel .bubble {
  margin: 8px; padding: 8px 10px; border-radius: 14px; background: #fff; box-shadow: 0 0 0 3px var(--ink);
  font-family: system-ui, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 0; color: var(--ink);
}
#rush-hud .panel .bubble b { display: block; font-family: 'Lilita One', system-ui, sans-serif; font-weight: 400; font-size: 14px; color: var(--coral); }
#rush-hud .panel .sfx {
  position: absolute; top: 8px; right: 10px; font-size: 24px; color: var(--sun); transform: rotate(-8deg);
  -webkit-text-stroke: 5px var(--ink); paint-order: stroke fill;
}
@media (max-width: 700px) { #rush-hud .strip { grid-template-columns: 1fr; } }
`;

export class ComicUI {
  private readonly card: HTMLElement;
  private done: (() => void) | null = null;

  public constructor(hudRoot: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.card = document.createElement('section');
    this.card.className = 'card comic';
    this.card.hidden = true;
    this.card.setAttribute('aria-live', 'polite');
    hudRoot.appendChild(this.card);
  }

  public get open(): boolean {
    return !this.card.hidden;
  }

  /** Shows a scene; `onDone` runs when the player continues. */
  public play(scene: Scene, onDone: () => void): void {
    const biome = TOUR[scene.world].biome;
    const [top, bottom] = SKY[biome];
    const panels = scene.panels.map((p, i) => {
      const n = p.cast.length;
      const figures = p.cast.map((a, k) => actor(a, 150 + (k - (n - 1) / 2) * 90, scene.world)).join('');
      return `<figure class="panel" style="margin:0">
        <svg viewBox="0 0 300 130" role="img" aria-label="Panel ${i + 1}: ${p.speaker}">
          <defs><linearGradient id="sky${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
          <rect width="300" height="130" fill="url(#sky${i})"/>
          <rect y="104" width="300" height="26" fill="${GROUND[biome]}"/><path d="M0 104 H300" stroke="${INK}" stroke-width="3"/>
          ${figures}
        </svg>
        ${p.sfx ? `<span class="sfx">${p.sfx}</span>` : ''}
        <figcaption class="bubble"><b>${p.speaker}</b>${p.line}</figcaption>
      </figure>`;
    }).join('');
    this.card.innerHTML = `
      <h2 class="logo toon">${scene.title}</h2>
      <div class="strip">${panels}</div>
      <div class="actions"><button class="btn primary go" type="button">Continue<kbd>Space</kbd></button></div>`;
    this.card.hidden = false;
    this.card.parentElement?.classList.add('mapping');
    this.done = onDone;
    const go = this.card.querySelector<HTMLElement>('.go');
    if (go) {
      go.addEventListener('mousedown', (e) => e.stopPropagation());
      go.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'Enter') e.stopPropagation();
      });
      go.addEventListener('click', (e) => {
        e.stopPropagation();
        this.finish();
      });
      go.focus({ preventScroll: true });
    }
  }

  /** Closes the strip and runs whatever it was holding back. */
  public finish(): void {
    if (this.card.hidden) return;
    this.card.hidden = true;
    this.card.parentElement?.classList.remove('mapping');
    const done = this.done;
    this.done = null;
    done?.();
  }
}
