import { BASELINE, CELL, ROWS, SPRITE_HEIGHT, cellFor } from '../../brawler/Animation';
import { DEPTH, MOVES, STATS, VIEW, type Brawl, type BrawlEvent, type Fighter, type Kind } from '../../brawler/Brawler';

/**
 * Neon Knuckles drawn (ADR-0015): dark silhouettes rimmed in neon, posed by a procedural skeleton,
 * over a rain-soaked city built from code. Canvas 2D at a fixed logical size (960 x 540), scaled
 * to the window.
 *
 * Static scenery (skyline, buildings, shop fronts) is painted once into offscreen strips and
 * scrolled at different speeds; only fighters, rain and effects are drawn each frame.
 */

export const W = 960;
export const H = 540;
/** The street on screen: the far edge (shop fronts) and the near edge (the kerb). */
const STREET_FAR = 372;
const STREET_NEAR = 512;
const SCALE = W / VIEW;

export const NEON: Record<Kind, string> = {
  kai: '#3de1ff',
  vex: '#ff3dd2',
  thug: '#ff8a3d',
  blade: '#3dffb0',
  brute: '#ff3d5a',
  boss: '#ffd23d'
};
export const NAMES: Record<Kind, string> = { kai: 'KAI', vex: 'VEX', thug: 'Choir thug', blade: 'Blade', brute: 'Brute', boss: 'CANTOR' };
const SIZE: Record<Kind, number> = { kai: 1.06, vex: 1, thug: 1, blade: 0.96, brute: 1.28, boss: 1.32 };
const BODY = '#0b0814';

type P = { x: number; y: number };

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  size: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function strip(width: number, height: number, draw: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  draw(c.getContext('2d')!);
  return c;
}

/** The painted art (ADR-0015 batch 1), as web-sized WebP made from the delivered JPEGs. */
const ART = '/assets/brawler/';
const PORTRAIT: Partial<Record<Kind, string>> = {
  kai: 'hero_kai_portrait', vex: 'hero_vex_portrait', boss: 'boss_cantor_portrait',
  thug: 'enemy_thug_portrait', blade: 'enemy_blade_portrait', brute: 'enemy_brute_portrait'
};

function image(name: string): HTMLImageElement {
  const img = new Image();
  img.src = `${ART}${name}.webp`;
  return img;
}

const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

const SIGNS = ['NOODLE', 'MOTEL', '24H', 'BAR', 'PAWN', 'KARAOKE', 'HOTEL', 'ARCADE', 'TATTOO', 'LIQUOR', 'DINER', 'CLUB'];
const SIGN_COLOURS = ['#ff3dd2', '#3de1ff', '#ffd23d', '#ff3d5a', '#3dffb0', '#a46bff'];

export class BrawlerRenderer {
  private readonly g: CanvasRenderingContext2D;
  private readonly sky: HTMLCanvasElement;
  private readonly far: HTMLCanvasElement;
  private readonly mid: HTMLCanvasElement;
  private readonly front: HTMLCanvasElement;
  private readonly rain: { x: number; y: number; speed: number; length: number }[] = [];
  private readonly sparks: Spark[] = [];
  private readonly pops: Pop[] = [];
  private shake = 0;
  private flash = 0;
  private clock = 0;
  private banner: { text: string; sub: string; life: number } | null = null;
  private go = 0;
  private readonly backdrop = image('stage1_street_backdrop');
  private readonly cover = image('title_cover');
  private readonly portraits = new Map<Kind, HTMLImageElement>();
  /** Animated sprite sheets, used for a fighter as soon as its sheet exists; silhouettes until then. */
  private readonly sheets = new Map<Kind, HTMLImageElement>();
  /** Round face crops of the portraits, made once each loads. */
  private readonly faces = new Map<Kind, HTMLCanvasElement>();
  /** The boss's entrance: his portrait slides in beside the banner. */
  private intro: { kind: Kind; life: number } | null = null;

  public constructor(private readonly canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.sky = strip(W, H, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, STREET_FAR);
      grad.addColorStop(0, '#07051a');
      grad.addColorStop(0.55, '#2a0b3d');
      grad.addColorStop(1, '#7a1a5c');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      // A moon in the smog.
      const moon = g.createRadialGradient(760, 90, 4, 760, 90, 120);
      moon.addColorStop(0, 'rgba(255,220,240,0.9)');
      moon.addColorStop(0.12, 'rgba(255,170,220,0.35)');
      moon.addColorStop(1, 'rgba(255,120,200,0)');
      g.fillStyle = moon;
      g.fillRect(600, 0, 320, 260);
    });
    this.far = this.skyline(2048, 7, 0.55, '#160a2c', 120, 300);
    this.mid = this.skyline(2048, 11, 0.85, '#0e0620', 170, 330, true);
    this.front = this.shopfronts(2048, 23);
    for (const [kind, name] of Object.entries(PORTRAIT) as [Kind, string][]) {
      const img = image(name);
      img.onload = () => this.faces.set(kind, this.face(img));
      this.portraits.set(kind, img);
    }
    for (const kind of Object.keys(NEON) as Kind[]) {
      const sheet = new Image();
      sheet.onload = () => this.sheets.set(kind, sheet);
      // A missing sheet is expected until the art is delivered: the silhouette stays.
      sheet.onerror = () => undefined;
      sheet.src = `${ART}sprites/${kind === 'boss' ? 'cantor' : kind}.png`;
    }
    const r = rng(5);
    for (let i = 0; i < 220; i++) this.rain.push({ x: r() * W, y: r() * H, speed: 700 + r() * 500, length: 8 + r() * 16 });
  }

  /** A circular crop around the face: the portraits frame the head in their upper middle. */
  private face(img: HTMLImageElement): HTMLCanvasElement {
    const size = 128;
    return strip(size, size, (g) => {
      const w = img.naturalWidth;
      const side = w * 0.5;
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      g.clip();
      g.drawImage(img, w * 0.25, img.naturalHeight * 0.07, side, side, 0, 0, size, size);
    });
  }

  public resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  // ─── Scenery, painted once ──────────────────────────────────────────────────────────────────

  private skyline(width: number, seed: number, light: number, colour: string, minH: number, base: number, signs = false): HTMLCanvasElement {
    const r = rng(seed);
    return strip(width, H, (g) => {
      let x = 0;
      while (x < width) {
        const w = 60 + r() * 110;
        const h = minH + r() * 160;
        g.fillStyle = colour;
        g.fillRect(x, base - h, w, h + 200);
        // Lit windows, mostly warm, a few cold.
        for (let wy = base - h + 12; wy < base - 10; wy += 14) {
          for (let wx = x + 8; wx < x + w - 10; wx += 12) {
            if (r() > 0.32 * light) continue;
            g.fillStyle = r() < 0.8 ? `rgba(255,190,120,${0.25 + r() * 0.5 * light})` : `rgba(120,220,255,${0.3 + r() * 0.4})`;
            g.fillRect(wx, wy, 5, 7);
          }
        }
        if (signs && r() < 0.6) this.sign(g, x + w / 2, base - h * (0.3 + r() * 0.5), SIGNS[Math.floor(r() * SIGNS.length)], SIGN_COLOURS[Math.floor(r() * SIGN_COLOURS.length)], 14, r() < 0.5);
        x += w + r() * 14;
      }
    });
  }

  private sign(g: CanvasRenderingContext2D, x: number, y: number, text: string, colour: string, size: number, vertical: boolean): void {
    g.save();
    g.font = `700 ${size}px "Space Grotesk Variable", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = colour;
    g.shadowBlur = 16;
    g.fillStyle = colour;
    if (vertical) {
      [...text].forEach((ch, i) => g.fillText(ch, x, y + i * size * 1.05));
    } else {
      g.strokeStyle = colour;
      g.lineWidth = 2;
      const w = g.measureText(text).width + 14;
      g.strokeRect(x - w / 2, y - size * 0.8, w, size * 1.6);
      g.fillText(text, x, y);
    }
    g.restore();
  }

  private shopfronts(width: number, seed: number): HTMLCanvasElement {
    const r = rng(seed);
    return strip(width, H, (g) => {
      const top = 130;
      g.fillStyle = '#0a0517';
      g.fillRect(0, top, width, STREET_FAR - top);
      let x = 0;
      while (x < width) {
        const w = 150 + r() * 120;
        const colour = SIGN_COLOURS[Math.floor(r() * SIGN_COLOURS.length)];
        // A lit shop window, a door, and its sign.
        const glass = g.createLinearGradient(0, 250, 0, STREET_FAR);
        glass.addColorStop(0, colour + '33');
        glass.addColorStop(1, colour + '0a');
        g.fillStyle = glass;
        g.fillRect(x + 14, 250, w - 60, STREET_FAR - 262);
        g.strokeStyle = colour + '88';
        g.lineWidth = 1.5;
        g.strokeRect(x + 14, 250, w - 60, STREET_FAR - 262);
        g.fillStyle = '#05020c';
        g.fillRect(x + w - 40, 268, 26, STREET_FAR - 268);
        this.sign(g, x + w / 2 - 10, 222, SIGNS[Math.floor(r() * SIGNS.length)], colour, 18, false);
        // Fire escapes and pipes above, in silhouette.
        g.strokeStyle = '#1c1030';
        g.lineWidth = 2;
        for (let fy = top + 20; fy < 190; fy += 30) g.strokeRect(x + 30, fy, w * 0.45, 2);
        x += w;
      }
      // The sidewalk.
      g.fillStyle = '#140c22';
      g.fillRect(0, STREET_FAR - 6, width, 10);
    });
  }

  // ─── A frame ────────────────────────────────────────────────────────────────────────────────

  /** Turns the sim's events into sparks, popups, shake and banners. */
  public react(brawl: Brawl, events: readonly BrawlEvent[]): void {
    for (const e of events) {
      if (e.type === 'hit') {
        const p = this.toScreen(brawl, e.x, e.z, e.y);
        const by = brawl.fighter(e.by);
        const colour = by ? NEON[by.kind] : '#fff';
        this.burst(p.x, p.y, colour, e.heavy ? 22 : 12, e.heavy ? 420 : 280);
        this.pops.push({ x: p.x, y: p.y - 20, text: String(e.damage), color: '#fff', life: 0.7, size: e.heavy ? 26 : 18 });
        this.shake = Math.max(this.shake, e.heavy ? 9 : 4);
        if (e.heavy) this.flash = Math.max(this.flash, 0.12);
      } else if (e.type === 'ko') {
        const p = this.toScreen(brawl, e.x, e.z, 40);
        this.pops.push({ x: p.x, y: p.y - 40, text: `KO  +${e.score}`, color: NEON[e.kind], life: 1.2, size: 24 });
        this.burst(p.x, p.y, NEON[e.kind], 30, 360);
        if (e.kind === 'boss') this.flash = 0.6;
      } else if (e.type === 'special') {
        const p = this.toScreen(brawl, e.x, e.z, 60);
        this.burst(p.x, p.y, '#ffffff', 40, 520);
        this.flash = 0.25;
        this.shake = 12;
      } else if (e.type === 'heal') {
        const p = this.toScreen(brawl, e.x, e.z, 30);
        this.pops.push({ x: p.x, y: p.y, text: '+HEALTH', color: '#3dffb0', life: 1, size: 18 });
      } else if (e.type === 'go') this.go = 3;
      else if (e.type === 'wave') {
        const foes = brawl.stage.waves[e.index].foes;
        if (foes.includes('boss')) {
          this.banner = { text: 'CANTOR', sub: 'Boss of the Choir', life: 2.6 };
          this.intro = { kind: 'boss', life: 2.6 };
        } else if (foes.includes('brute') && !this.seenBrute) {
          this.seenBrute = true;
          this.intro = { kind: 'brute', life: 1.8 };
        }
      }
    }
  }

  private burst(x: number, y: number, color: string, n: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.25 + Math.random() * 0.25, max: 0.5, color, width: 1.5 + Math.random() * 2 });
    }
  }

  public title(text: string, sub: string): void {
    this.banner = { text, sub, life: 3 };
  }

  private toScreen(brawl: Brawl, x: number, z: number, y = 0): P {
    const depth = 1 - z / DEPTH;
    return { x: (x - brawl.camera) * SCALE + W / 2, y: STREET_FAR + (STREET_NEAR - STREET_FAR) * depth - y * SCALE };
  }

  public render(brawl: Brawl, dt: number): void {
    this.clock += dt;
    const g = this.g;
    const k = this.canvas.width / W;
    const kh = this.canvas.height / H;
    // Letterbox to keep 16:9.
    const s = Math.min(k, kh);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const ox = (this.canvas.width - W * s) / 2;
    const oy = (this.canvas.height - H * s) / 2;
    this.shake *= Math.pow(0.0005, dt);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    g.setTransform(s, 0, 0, s, ox + sx * s, oy + sy * s);
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();

    this.drawScenery(brawl);
    this.drawStreet(brawl);
    // Fighters and pickups far to near, so nearer ones overlap.
    for (const p of brawl.pickups) this.drawPickup(brawl, p.x, p.z);
    const order = brawl.fighters.filter((f) => f.state !== 'dead').sort((a, b) => b.z - a.z);
    for (const f of order) this.drawShadow(brawl, f);
    for (const f of order) this.drawFighter(brawl, f);
    this.drawRain(dt);
    this.drawEffects(dt);
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${Math.min(0.5, this.flash)})`;
      g.fillRect(0, 0, W, H);
      this.flash -= dt;
    }
    this.drawVignette();
    this.drawHud(brawl, dt);
    g.restore();
  }

  private drawScenery(brawl: Brawl): void {
    const g = this.g;
    g.drawImage(this.sky, 0, 0);
    const layer = (img: HTMLCanvasElement, factor: number, y = 0) => {
      const off = (((brawl.camera * SCALE * factor) % img.width) + img.width) % img.width;
      g.drawImage(img, -off, y);
      g.drawImage(img, img.width - off, y);
    };
    if (ready(this.backdrop)) {
      // The painted street, scaled to the view's height above the kerb and scrolled slower than
      // the fighters for depth. Copies repeat side by side; mirroring them would flip the signs.
      const b = this.backdrop;
      const h = STREET_FAR + 40;
      const w = (b.naturalWidth * h) / b.naturalHeight;
      const off = (((brawl.camera * SCALE * 0.7) % w) + w) % w;
      for (let i = 0; i < Math.ceil(W / w) + 1; i++) g.drawImage(b, i * w - off, 0, w, h);
      this.reflection = (gg) => {
        for (let i = -1; i < Math.ceil(W / w) + 2; i++) {
          const x = i * w - off;
          if (x > W || x + w < 0) continue;
          gg.drawImage(b, 0, 0, b.naturalWidth, b.naturalHeight * 0.75, x, 0, w, h * 0.75);
        }
      };
      return;
    }
    this.reflection = null;
    layer(this.far, 0.15, 20);
    layer(this.mid, 0.4, 40);
    // Haze between the skyline and the street.
    const haze = g.createLinearGradient(0, 250, 0, STREET_FAR);
    haze.addColorStop(0, 'rgba(122,26,92,0)');
    haze.addColorStop(1, 'rgba(122,26,92,0.35)');
    g.fillStyle = haze;
    g.fillRect(0, 200, W, STREET_FAR - 200);
    layer(this.front, 1);
  }

  /** Draws whatever the street should mirror; set by the scenery each frame. */
  private seenBrute = false;
  private reflection: ((g: CanvasRenderingContext2D) => void) | null = null;

  private drawStreet(brawl: Brawl): void {
    const g = this.g;
    const asphalt = g.createLinearGradient(0, STREET_FAR, 0, H);
    asphalt.addColorStop(0, '#120a20');
    asphalt.addColorStop(1, '#05030b');
    g.fillStyle = asphalt;
    g.fillRect(0, STREET_FAR, W, H - STREET_FAR);
    // The wet street mirrors the shop fronts.
    g.save();
    g.globalAlpha = 0.22;
    g.translate(0, STREET_FAR * 2 + 4);
    g.scale(1, -1);
    if (this.reflection) this.reflection(g);
    else {
      const off = (((brawl.camera * SCALE) % this.front.width) + this.front.width) % this.front.width;
      g.drawImage(this.front, -off, 0);
      g.drawImage(this.front, this.front.width - off, 0);
    }
    g.restore();
    // Puddle ripples and lane paint, moving with the street.
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const y = STREET_FAR + 12 + i * 22;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    const dash = 90;
    const shift = (brawl.camera * SCALE) % dash;
    g.fillStyle = 'rgba(255,210,61,0.25)';
    for (let x = -shift; x < W; x += dash) g.fillRect(x, STREET_NEAR - 6, 46, 3);
  }

  private drawShadow(brawl: Brawl, f: Fighter): void {
    const p = this.toScreen(brawl, f.x, f.z);
    const r = 26 * SIZE[f.kind] * Math.max(0.5, 1 - f.y / 300);
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.ellipse(p.x, p.y, r, r * 0.28, 0, 0, Math.PI * 2);
    g.fill();
    // Neon spill on the wet ground.
    g.fillStyle = NEON[f.kind] + '22';
    g.beginPath();
    g.ellipse(p.x, p.y + 2, r * 1.6, r * 0.4, 0, 0, Math.PI * 2);
    g.fill();
  }

  private drawPickup(brawl: Brawl, x: number, z: number): void {
    const p = this.toScreen(brawl, x, z, 10 + Math.sin(this.clock * 4) * 3);
    const g = this.g;
    g.save();
    g.shadowColor = '#3dffb0';
    g.shadowBlur = 18;
    g.fillStyle = '#3dffb0';
    g.fillRect(p.x - 3, p.y - 10, 6, 20);
    g.fillRect(p.x - 10, p.y - 3, 20, 6);
    g.restore();
  }

  // ─── Fighters ───────────────────────────────────────────────────────────────────────────────

  /** The skeleton's joints for this fighter's state, facing right, feet at the origin, y down. */
  private pose(f: Fighter): { joints: Record<string, P>; lean: number; down: number } {
    const h = 128 * SIZE[f.kind];
    const t = f.t;
    let legA = 0;
    let legB = 0;
    let kneeA = 0.2;
    let kneeB = 0.2;
    let lean = 0.05;
    let armA = 0.4; // lead arm: shoulder angle from straight down, forward positive
    let elbowA = -1.9;
    let armB = 0.1;
    let elbowB = -2.1;
    let crouch = 0.04;
    let down = 0;
    const breathe = Math.sin(this.clock * 3 + f.id) * 0.015;

    switch (f.state) {
      case 'walk': {
        const c = Math.sin(t * 11);
        legA = c * 0.55;
        legB = -c * 0.55;
        kneeA = 0.25 + Math.max(0, -c) * 0.6;
        kneeB = 0.25 + Math.max(0, c) * 0.6;
        armA = 0.5 - c * 0.2;
        armB = 0.1 + c * 0.25;
        lean = 0.1;
        break;
      }
      case 'jump':
        legA = 0.6;
        legB = -0.2;
        kneeA = 1.4;
        kneeB = 1.1;
        crouch = 0;
        if (f.move === 'airkick') {
          legA = 1.45;
          kneeA = 0.05;
          lean = -0.35;
          armA = -0.6;
          armB = -0.9;
        }
        break;
      case 'attack': {
        const m = f.move ? MOVES[f.move] : null;
        const phase = m ? (t < m.startup ? t / m.startup - 1 : t < m.startup + m.active ? 1 : Math.max(0, 1 - (t - m.startup - m.active) / m.recover)) : 0;
        const out = Math.max(0, phase);
        const wind = Math.max(0, -phase);
        legA = 0.35;
        legB = -0.3;
        kneeA = 0.35;
        kneeB = 0.15;
        lean = 0.12 + out * 0.15 - wind * 0.15;
        if (f.move === 'jab1' || f.move === 'jab3' || f.move === 'swipe' || f.move === 'slash') {
          armA = 0.4 + out * 1.15 - wind * 0.3;
          elbowA = -1.9 + out * 1.85;
        } else if (f.move === 'jab2') {
          armB = 0.1 + out * 1.4 - wind * 0.5;
          elbowB = -2.1 + out * 2.05;
          armA = 0.2;
        } else if (f.move === 'heavy') {
          // A roundhouse kick.
          legA = 0.2 + out * 1.4 - wind * 0.4;
          kneeA = 1.2 - out * 1.15;
          lean = -0.25 * out + 0.1;
          armA = -0.4;
          armB = 0.8;
        } else if (f.move === 'special') {
          armA = 1.57;
          elbowA = 0;
          armB = -1.57;
          elbowB = 0;
          lean = 0;
        } else if (f.move === 'slam') {
          armA = 3.0 - out * 2.0;
          armB = 3.0 - out * 2.0;
          elbowA = elbowB = -0.3;
          lean = -0.2 + out * 0.6;
          crouch = out * 0.12;
        } else if (f.move === 'charge') {
          lean = 0.55;
          armA = 1.2;
          armB = 1.0;
          elbowA = elbowB = -0.5;
          const run = Math.sin(t * 16);
          legA = run * 0.7;
          legB = -run * 0.7;
        }
        break;
      }
      case 'hurt':
        lean = -0.4;
        armA = -0.3;
        armB = -0.6;
        elbowA = elbowB = -0.4;
        kneeA = kneeB = 0.4;
        break;
      case 'down':
        down = Math.min(1, t * 6);
        lean = -0.3;
        armA = -1.2;
        armB = -1.6;
        elbowA = elbowB = -0.3;
        legA = 0.3;
        legB = -0.1;
        break;
      case 'getup':
        crouch = 0.25 * (1 - t / 0.35);
        lean = 0.4;
        kneeA = kneeB = 1.2 * (1 - t / 0.35);
        break;
      default:
        crouch += breathe;
    }

    const thigh = 0.25 * h;
    const shin = 0.25 * h;
    const torso = 0.3 * h;
    const upper = 0.17 * h;
    const fore = 0.16 * h;
    const legLen = thigh + shin;
    const hip: P = { x: 0, y: -legLen * (1 - crouch) };
    const leg = (a: number, kb: number) => {
      const knee = { x: hip.x + Math.sin(a) * thigh, y: hip.y + Math.cos(a) * thigh };
      const foot = { x: knee.x + Math.sin(a - kb) * shin, y: knee.y + Math.cos(a - kb) * shin };
      return { knee, foot };
    };
    const la = leg(legA, kneeA);
    const lb = leg(legB, kneeB);
    // Keep the lower foot on the ground.
    const lowest = Math.max(la.foot.y, lb.foot.y, 0);
    const drop = f.state === 'jump' ? 0 : -lowest;
    const chest = { x: hip.x + Math.sin(lean) * torso, y: hip.y - Math.cos(lean) * torso };
    const head = { x: chest.x + Math.sin(lean) * 0.12 * h, y: chest.y - Math.cos(lean) * 0.12 * h };
    const arm = (a: number, e: number, side: number) => {
      const shoulder = { x: chest.x + side * 0.02 * h, y: chest.y + 0.02 * h };
      const elbow = { x: shoulder.x + Math.sin(a + lean) * upper, y: shoulder.y + Math.cos(a + lean) * upper };
      const hand = { x: elbow.x + Math.sin(a + lean - e) * fore, y: elbow.y + Math.cos(a + lean - e) * fore };
      return { shoulder, elbow, hand };
    };
    const aa = arm(armA, elbowA, 1);
    const ab = arm(armB, elbowB, -1);
    const joints: Record<string, P> = {
      hip, chest, head,
      kneeA: la.knee, footA: la.foot, kneeB: lb.knee, footB: lb.foot,
      shoulderA: aa.shoulder, elbowA: aa.elbow, handA: aa.hand,
      shoulderB: ab.shoulder, elbowB: ab.elbow, handB: ab.hand
    };
    for (const j of Object.values(joints)) j.y += drop;
    return { joints, lean, down };
  }

  private drawFighter(brawl: Brawl, f: Fighter): void {
    const g = this.g;
    const base = this.toScreen(brawl, f.x, f.z, f.y);
    const { joints: j, down } = this.pose(f);
    const h = 128 * SIZE[f.kind];
    const colour = NEON[f.kind];
    const blink = f.safe > 0 && Math.floor(this.clock * 16) % 2 === 0;
    if (blink && f.state !== 'down') return;
    const sheet = this.sheets.get(f.kind);
    if (sheet) {
      // The painted fighter: its cell, feet on the ground point, a soft neon halo behind it.
      const cell = cellFor(f, this.clock);
      const k = (h * SCALE) / SPRITE_HEIGHT;
      g.save();
      g.translate(base.x, base.y);
      g.scale(k * f.facing, k);
      g.shadowColor = colour;
      g.shadowBlur = f.state === 'attack' ? 20 : 10;
      g.drawImage(sheet, cell.frame * CELL, ROWS.indexOf(cell.row) * CELL, CELL, CELL, -CELL / 2, -BASELINE, CELL, CELL);
      g.restore();
      this.drawHealth(f, base, h, colour);
      return;
    }

    g.save();
    g.translate(base.x, base.y);
    g.scale(SCALE * f.facing, SCALE);
    if (down > 0) g.rotate(-down * Math.PI * 0.5);
    // A limb as a tapered capsule: wide at the joint it hangs from, narrow at the end, with a
    // bulge a third of the way down where the muscle is.
    const limb = (a: P, b: P, w1: number, w2: number) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const m = { x: a.x + dx * 0.35, y: a.y + dy * 0.35 };
      const wm = w1 * 1.08;
      g.beginPath();
      g.moveTo(a.x + nx * w1 / 2, a.y + ny * w1 / 2);
      g.quadraticCurveTo(m.x + nx * wm / 2 + nx, m.y + ny * wm / 2, b.x + nx * w2 / 2, b.y + ny * w2 / 2);
      g.lineTo(b.x - nx * w2 / 2, b.y - ny * w2 / 2);
      g.quadraticCurveTo(m.x - nx * wm / 2, m.y - ny * wm / 2, a.x - nx * w1 / 2, a.y - ny * w1 / 2);
      g.closePath();
      g.fill();
      g.beginPath();
      g.arc(a.x, a.y, w1 / 2, 0, Math.PI * 2);
      g.arc(b.x, b.y, w2 / 2, 0, Math.PI * 2);
      g.fill();
    };
    const female = f.kind === 'vex';
    const heavy = f.kind === 'brute' || f.kind === 'boss';
    const foot = (knee: P, ankle: P, e: number) => {
      // A boot: heel under the ankle, toe forward.
      g.beginPath();
      g.moveTo(ankle.x - 0.03 * h - e, ankle.y - 0.02 * h - e);
      g.lineTo(ankle.x + 0.02 * h + e, ankle.y - 0.025 * h - e);
      g.quadraticCurveTo(ankle.x + 0.1 * h + e, ankle.y - 0.01 * h, ankle.x + 0.1 * h + e, ankle.y + 0.012 * h + e);
      g.lineTo(ankle.x - 0.035 * h - e, ankle.y + 0.012 * h + e);
      g.closePath();
      g.fill();
      void knee;
    };
    const body = (fill: string, e: number) => {
      g.fillStyle = fill;
      const k = heavy ? 1.3 : female ? 0.92 : 1;
      // Back limbs first.
      limb(j.hip, j.kneeB, 0.105 * h * k + e, 0.068 * h * k + e);
      limb(j.kneeB, j.footB, 0.068 * h * k + e, 0.042 * h + e);
      foot(j.kneeB, j.footB, e / 2);
      limb(j.shoulderB, j.elbowB, 0.062 * h * k + e, 0.046 * h * k + e);
      limb(j.elbowB, j.handB, 0.048 * h * k + e, 0.036 * h + e);
      g.beginPath();
      g.arc(j.handB.x, j.handB.y, 0.034 * h * k + e / 2, 0, Math.PI * 2);
      g.fill();
      // Torso: shoulders, chest, waist and hips, shaped per fighter.
      const dx = j.chest.x - j.hip.x;
      const dy = j.chest.y - j.hip.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const at = (t: number, w: number) => ({ x: j.hip.x + dx * t + nx * w, y: j.hip.y + dy * t + ny * w });
      const sh = (female ? 0.088 : heavy ? 0.15 : 0.11) * h + e;
      const chest = (female ? 0.09 : heavy ? 0.14 : 0.1) * h + e;
      const waist = (female ? 0.055 : heavy ? 0.12 : 0.07) * h + e;
      const hips = (female ? 0.088 : heavy ? 0.11 : 0.072) * h + e;
      g.beginPath();
      const p0 = at(-0.08, hips);
      g.moveTo(p0.x, p0.y);
      const c1 = at(0.4, waist);
      const p1 = at(0.78, chest);
      g.quadraticCurveTo(c1.x, c1.y, p1.x, p1.y);
      const p2 = at(1.04, sh);
      g.quadraticCurveTo(at(0.95, sh * 1.05).x, at(0.95, sh * 1.05).y, p2.x, p2.y);
      const p3 = at(1.08, 0);
      g.quadraticCurveTo(at(1.1, sh * 0.6).x, at(1.1, sh * 0.6).y, p3.x, p3.y);
      const p4 = at(1.04, -sh);
      g.quadraticCurveTo(at(1.1, -sh * 0.6).x, at(1.1, -sh * 0.6).y, p4.x, p4.y);
      const p5 = at(0.78, -chest);
      g.quadraticCurveTo(at(0.95, -sh * 1.05).x, at(0.95, -sh * 1.05).y, p5.x, p5.y);
      const c6 = at(0.4, -waist);
      const p6 = at(-0.08, -hips);
      g.quadraticCurveTo(c6.x, c6.y, p6.x, p6.y);
      g.quadraticCurveTo(at(-0.2, 0).x, at(-0.2, 0).y, p0.x, p0.y);
      g.fill();
      // Neck and head (a jaw, not a ball).
      limb(j.chest, j.head, 0.05 * h + e, 0.042 * h + e);
      const hr = 0.062 * h + e / 2;
      g.beginPath();
      g.ellipse(j.head.x, j.head.y - 0.035 * h, hr * 0.9, hr, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(j.head.x - hr * 0.6, j.head.y - 0.02 * h);
      g.quadraticCurveTo(j.head.x + hr * 0.3, j.head.y + 0.04 * h, j.head.x + hr * 0.95, j.head.y - 0.02 * h);
      g.lineTo(j.head.x + hr * 0.9, j.head.y - 0.06 * h);
      g.fill();
      this.hair(f, j.head, h, e);
      // Front limbs.
      limb(j.hip, j.kneeA, 0.105 * h * k + e, 0.068 * h * k + e);
      limb(j.kneeA, j.footA, 0.068 * h * k + e, 0.042 * h + e);
      foot(j.kneeA, j.footA, e / 2);
      limb(j.shoulderA, j.elbowA, 0.062 * h * k + e, 0.046 * h * k + e);
      limb(j.elbowA, j.handA, 0.048 * h * k + e, 0.036 * h + e);
      g.beginPath();
      g.arc(j.handA.x, j.handA.y, 0.034 * h * k + e / 2, 0, Math.PI * 2);
      g.fill();
    };
    // The neon rim: a blurred glow pass in the fighter's colour, then the dark body on top.
    g.shadowColor = colour;
    g.shadowBlur = f.state === 'attack' ? 22 : 12;
    body(colour, 3.2);
    g.shadowBlur = 0;
    body(BODY, 0);
    // Neon trim on the clothes: collar, belt, cuffs, boot tops. The detail a silhouette carries.
    g.strokeStyle = colour;
    g.lineWidth = 1.6;
    g.globalAlpha = 0.85;
    const seg = (a: P, b: P, t: number, w: number) => {
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      g.beginPath();
      g.moveTo(x - (dy / l) * w, y + (dx / l) * w);
      g.lineTo(x + (dy / l) * w, y - (dx / l) * w);
      g.stroke();
    };
    seg(j.hip, j.chest, 0.08, (female ? 0.075 : 0.07) * h);
    seg(j.kneeA, j.footA, 0.55, 0.03 * h);
    seg(j.kneeB, j.footB, 0.55, 0.03 * h);
    seg(j.elbowA, j.handA, 0.72, 0.024 * h);
    seg(j.elbowB, j.handB, 0.72, 0.024 * h);
    // A jacket edge from collar to hem.
    g.beginPath();
    g.moveTo(j.chest.x + 0.03 * h, j.chest.y + 0.01 * h);
    g.quadraticCurveTo(j.chest.x + 0.06 * h, (j.chest.y + j.hip.y) / 2, j.hip.x + 0.05 * h, j.hip.y - 0.02 * h);
    g.stroke();
    g.globalAlpha = 1;
    // An eye catches the light.
    g.fillStyle = colour;
    g.fillRect(j.head.x + 0.03 * h, j.head.y - 0.045 * h, 0.025 * h, 0.01 * h);
    // A fist glows while it can hit.
    if (f.state === 'attack' && f.move) {
      const m = MOVES[f.move];
      if (f.t >= m.startup && f.t < m.startup + m.active) {
        const fist = f.move === 'heavy' ? j.footA : f.move === 'jab2' ? j.handB : j.handA;
        g.shadowColor = colour;
        g.shadowBlur = 24;
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(fist.x, fist.y, 0.045 * h, 0, Math.PI * 2);
        g.fill();
        if (f.move === 'special') {
          g.strokeStyle = colour;
          g.lineWidth = 4;
          g.beginPath();
          g.ellipse(0, -0.55 * h, 0.7 * h, 0.2 * h, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
    }
    g.restore();

    this.drawHealth(f, base, h, colour);
  }

  /** Foes' health over their heads once hurt; the boss has a bar of his own in the HUD. */
  private drawHealth(f: Fighter, base: P, h: number, colour: string): void {
    const g = this.g;
    if (f.team === 'foe' && f.kind !== 'boss' && f.hp < STATS[f.kind].hp && f.hp > 0) {
      const w = 40;
      const top = base.y - h * SCALE - 14;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(base.x - w / 2, top, w, 4);
      g.fillStyle = colour;
      g.fillRect(base.x - w / 2, top, (w * f.hp) / STATS[f.kind].hp, 4);
    }
  }

  private hair(f: Fighter, head: P, h: number, extra: number): void {
    const g = this.g;
    const sway = Math.sin(this.clock * 6 + f.id) * 0.03 * h - (f.state === 'walk' ? 0.04 * h : 0);
    g.beginPath();
    if (f.kind === 'vex') {
      // A swept, chin-length cut that streams behind.
      g.moveTo(head.x - 0.02 * h, head.y - 0.1 * h);
      g.quadraticCurveTo(head.x - 0.2 * h, head.y - 0.12 * h + sway, head.x - 0.24 * h + sway, head.y + 0.1 * h);
      g.quadraticCurveTo(head.x - 0.12 * h, head.y - 0.02 * h, head.x - 0.06 * h, head.y - 0.04 * h);
      g.fill();
      if (extra > 0) g.stroke();
    } else if (f.kind === 'kai') {
      // Swept-back spikes.
      for (let i = 0; i < 4; i++) {
        g.moveTo(head.x + 0.04 * h - i * 0.035 * h, head.y - 0.09 * h);
        g.lineTo(head.x - 0.06 * h - i * 0.04 * h, head.y - 0.15 * h + i * 0.02 * h);
        g.lineTo(head.x - i * 0.035 * h, head.y - 0.06 * h);
      }
      g.fill();
    } else if (f.kind === 'blade') {
      // A sharp bob.
      g.moveTo(head.x + 0.06 * h, head.y - 0.12 * h);
      g.lineTo(head.x - 0.1 * h, head.y - 0.1 * h);
      g.lineTo(head.x - 0.09 * h, head.y + 0.04 * h);
      g.lineTo(head.x - 0.02 * h, head.y - 0.02 * h);
      g.fill();
    } else if (f.kind === 'boss') {
      // Cantor's hat.
      g.fillRect(head.x - 0.13 * h, head.y - 0.11 * h, 0.26 * h, 0.025 * h);
      g.fillRect(head.x - 0.07 * h, head.y - 0.2 * h, 0.14 * h, 0.1 * h);
    }
  }

  // ─── Atmosphere and effects ─────────────────────────────────────────────────────────────────

  private drawRain(dt: number): void {
    const g = this.g;
    g.strokeStyle = 'rgba(180,200,255,0.28)';
    g.lineWidth = 1;
    g.beginPath();
    for (const d of this.rain) {
      d.y += d.speed * dt;
      d.x -= d.speed * dt * 0.15;
      if (d.y > H) {
        d.y = -20;
        d.x = Math.random() * (W + 100);
      }
      g.moveTo(d.x, d.y);
      g.lineTo(d.x + d.length * 0.15, d.y - d.length);
    }
    g.stroke();
  }

  private drawEffects(dt: number): void {
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vy += 900 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      g.strokeStyle = s.color;
      g.globalAlpha = Math.min(1, s.life / 0.2);
      g.lineWidth = s.width;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
      g.stroke();
    }
    g.restore();
    g.save();
    g.textAlign = 'center';
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pops.splice(i, 1);
        continue;
      }
      p.y -= 40 * dt;
      g.globalAlpha = Math.min(1, p.life * 3);
      g.font = `800 ${p.size}px "Space Grotesk Variable", system-ui, sans-serif`;
      g.fillStyle = p.color;
      g.shadowColor = p.color;
      g.shadowBlur = 10;
      g.fillText(p.text, p.x, p.y);
    }
    g.restore();
  }

  private drawVignette(): void {
    const g = this.g;
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────────────────────

  private drawHud(brawl: Brawl, dt: number): void {
    const g = this.g;
    g.save();
    brawl.players.forEach((p, slot) => {
      const right = slot === 1;
      const kind: Kind = slot === 0 ? 'kai' : 'vex';
      const colour = NEON[kind];
      this.avatar(kind, right ? W - 58 : 58, 52, 34, p.joined);
      const x = right ? W - 104 : 104;
      g.textAlign = right ? 'right' : 'left';
      if (!p.joined) {
        g.globalAlpha = 0.55 + Math.sin(this.clock * 4) * 0.3;
        g.font = '700 14px "Space Grotesk Variable", system-ui, sans-serif';
        g.fillStyle = colour;
        g.fillText('PLAYER 2 — PRESS  ,  TO JOIN', x, 34);
        g.globalAlpha = 1;
        return;
      }
      const f = brawl.fighter(p.fighter);
      g.font = '800 20px "Space Grotesk Variable", system-ui, sans-serif';
      g.fillStyle = colour;
      g.shadowColor = colour;
      g.shadowBlur = 10;
      g.fillText(`${NAMES[kind]}  ×${Math.max(0, p.lives)}`, x, 34);
      g.shadowBlur = 0;
      g.font = '700 16px "JetBrains Mono Variable", ui-monospace, monospace';
      g.fillStyle = '#fff';
      g.fillText(String(p.score).padStart(7, '0'), x, 100);
      // Health and rage.
      const bar = (y: number, share: number, fill: string, w: number, hgt: number) => {
        const left = right ? x - w : x;
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(left, y, w, hgt);
        g.fillStyle = fill;
        g.fillRect(right ? x - w * share : left, y, w * Math.max(0, share), hgt);
      };
      bar(44, f ? Math.max(0, f.hp) / STATS[kind].hp : 0, colour, 220, 12);
      const full = p.rage >= 50;
      bar(62, p.rage / 100, full ? (Math.floor(this.clock * 8) % 2 ? '#fff' : '#ffd23d') : '#ffd23d', 160, 6);
      if (full) {
        g.font = '700 11px "Space Grotesk Variable", system-ui, sans-serif';
        g.fillStyle = '#ffd23d';
        g.fillText(slot === 0 ? 'SPECIAL READY — L' : 'SPECIAL READY — SHIFT', right ? x - 168 : x + 168, 70);
      }
      if (p.combo >= 2) {
        g.textAlign = right ? 'right' : 'left';
        g.font = `900 ${28 + Math.min(20, p.combo)}px "Space Grotesk Variable", system-ui, sans-serif`;
        g.fillStyle = colour;
        g.shadowColor = colour;
        g.shadowBlur = 14;
        g.fillText(`${p.combo} HITS`, x, 160);
        g.shadowBlur = 0;
        const mult = brawl.multiplier(slot);
        if (mult > 1) {
          g.font = '800 16px "Space Grotesk Variable", system-ui, sans-serif';
          g.fillStyle = '#fff';
          g.fillText(`×${mult.toFixed(1)} SCORE`, x, 182);
        }
      }
    });

    // The boss's bar.
    const boss = brawl.foes().find((f) => f.kind === 'boss');
    if (boss) {
      const w = 420;
      g.textAlign = 'center';
      g.font = '900 16px "Space Grotesk Variable", system-ui, sans-serif';
      g.fillStyle = NEON.boss;
      g.fillText('CANTOR', W / 2 + 18, H - 46);
      this.avatar('boss', W / 2 - 50, H - 52, 18, true);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(W / 2 - w / 2, H - 38, w, 10);
      g.fillStyle = NEON.boss;
      g.fillRect(W / 2 - w / 2, H - 38, (w * Math.max(0, boss.hp)) / STATS.boss.hp, 10);
    }

    if (this.intro) this.drawIntro(dt);
    if (this.go > 0) {
      this.go -= dt;
      if (Math.floor(this.go * 3) % 2 === 0) {
        g.textAlign = 'right';
        g.font = '900 44px "Space Grotesk Variable", system-ui, sans-serif';
        g.fillStyle = '#ffd23d';
        g.shadowColor = '#ffd23d';
        g.shadowBlur = 20;
        g.fillText('GO  →', W - 40, H / 2);
        g.shadowBlur = 0;
      }
    }
    if (this.banner) {
      this.banner.life -= dt;
      const a = Math.min(1, this.banner.life);
      if (a <= 0) this.banner = null;
      else {
        g.globalAlpha = a;
        g.textAlign = 'center';
        g.font = '900 64px "Space Grotesk Variable", system-ui, sans-serif';
        g.fillStyle = '#fff';
        g.shadowColor = '#ff3dd2';
        g.shadowBlur = 30;
        g.fillText(this.banner.text, W / 2, H / 2 - 30);
        g.shadowBlur = 0;
        g.font = '600 18px "Space Grotesk Variable", system-ui, sans-serif';
        g.fillStyle = '#ffb8ec';
        g.fillText(this.banner.sub, W / 2, H / 2 + 6);
        g.globalAlpha = 1;
      }
    }
    g.restore();
  }

  /** A round portrait with a neon ring, dimmed while that player is not in. */
  private avatar(kind: Kind, x: number, y: number, r: number, lit: boolean): void {
    const g = this.g;
    const face = this.faces.get(kind);
    g.save();
    g.globalAlpha = lit ? 1 : 0.35;
    if (face) g.drawImage(face, x - r, y - r, r * 2, r * 2);
    else {
      g.fillStyle = BODY;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = NEON[kind];
    g.lineWidth = 3;
    g.shadowColor = NEON[kind];
    g.shadowBlur = 14;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  /** A painted portrait sliding in from the right as a fighter of note arrives. */
  private drawIntro(dt: number): void {
    const intro = this.intro!;
    intro.life -= dt;
    if (intro.life <= 0) {
      this.intro = null;
      return;
    }
    const img = this.portraits.get(intro.kind);
    if (!img || !ready(img)) return;
    const g = this.g;
    const total = intro.kind === 'boss' ? 2.6 : 1.8;
    const t = total - intro.life;
    const enter = Math.min(1, t / 0.35);
    const leave = Math.min(1, intro.life / 0.35);
    const ease = (k: number) => 1 - Math.pow(1 - k, 3);
    const h = H * 0.9;
    const w = (img.naturalWidth * h) / img.naturalHeight;
    const x = W - w * ease(enter) * ease(leave) + 20;
    g.save();
    g.globalAlpha = Math.min(enter, leave);
    // Slanted panel, comic-style.
    g.beginPath();
    g.moveTo(x + 60, H * 0.05);
    g.lineTo(W, H * 0.05);
    g.lineTo(W, H * 0.95);
    g.lineTo(x, H * 0.95);
    g.closePath();
    g.clip();
    g.drawImage(img, x, H * 0.05, w, h);
    g.restore();
    g.save();
    g.globalAlpha = Math.min(enter, leave);
    g.strokeStyle = NEON[intro.kind];
    g.lineWidth = 4;
    g.shadowColor = NEON[intro.kind];
    g.shadowBlur = 18;
    g.beginPath();
    g.moveTo(x + 60, H * 0.05);
    g.lineTo(x, H * 0.95);
    g.stroke();
    if (intro.kind !== 'boss') {
      g.textAlign = 'right';
      g.font = '900 36px "Space Grotesk Variable", system-ui, sans-serif';
      g.fillStyle = '#fff';
      g.fillText(NAMES[intro.kind].toUpperCase(), W - 30, H * 0.88);
    }
    g.restore();
  }

  /**
   * A story face-off: the two portraits large on either side, the speaker lit and the listener
   * dimmed, and the line typing out in a box below. Heroes stand on the left, the Choir on the right.
   */
  public story(speaker: Kind, facing: Kind, text: string, shown: number): void {
    const g = this.g;
    const hero = (k: Kind) => k === 'kai' || k === 'vex';
    const left = hero(speaker) ? speaker : facing;
    const right = left === speaker ? facing : speaker;
    g.save();
    g.fillStyle = 'rgba(5,2,12,0.72)';
    g.fillRect(0, 0, W, H);
    const draw = (kind: Kind, side: 'left' | 'right') => {
      const img = this.portraits.get(kind);
      if (!img || !ready(img)) return;
      const lit = kind === speaker;
      const h = H * 0.86;
      const w = (img.naturalWidth * h) / img.naturalHeight;
      const x = side === 'left' ? 30 : W - w - 30;
      g.save();
      g.globalAlpha = lit ? 1 : 0.32;
      if (!lit) g.filter = 'grayscale(0.7) brightness(0.7)';
      g.drawImage(img, x, H - h - 4 + (lit ? 0 : 10), w, h);
      g.restore();
      if (lit) {
        g.save();
        g.strokeStyle = NEON[kind];
        g.lineWidth = 3;
        g.shadowColor = NEON[kind];
        g.shadowBlur = 20;
        g.strokeRect(x, H - h - 4, w, h);
        g.restore();
      }
    };
    draw(left, 'left');
    draw(right, 'right');
    // The dialogue box.
    const bx = 150;
    const by = H - 150;
    const bw = W - 300;
    g.fillStyle = 'rgba(8,4,18,0.92)';
    g.fillRect(bx, by, bw, 120);
    g.strokeStyle = NEON[speaker];
    g.lineWidth = 2;
    g.strokeRect(bx, by, bw, 120);
    g.font = '900 20px "Space Grotesk Variable", system-ui, sans-serif';
    g.fillStyle = NEON[speaker];
    g.textAlign = 'left';
    g.fillText(NAMES[speaker].toUpperCase(), bx + 20, by + 32);
    g.font = '500 18px "Space Grotesk Variable", system-ui, sans-serif';
    g.fillStyle = '#f2ecff';
    const visible = text.slice(0, Math.floor(shown));
    let line = '';
    let y = by + 62;
    for (const word of visible.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (g.measureText(next).width > bw - 40) {
        g.fillText(line, bx + 20, y);
        line = word;
        y += 26;
      } else line = next;
    }
    g.fillText(line, bx + 20, y);
    if (shown >= text.length && Math.floor(this.clock * 2.5) % 2 === 0) {
      g.textAlign = 'right';
      g.font = '700 13px "Space Grotesk Variable", system-ui, sans-serif';
      g.fillStyle = NEON[speaker];
      g.fillText('ENTER / J  ▶', bx + bw - 16, by + 110);
    }
    g.restore();
  }

  /** Full-screen panels: title, pause, game over, stage clear, over the painted cover art. */
  public panel(title: string, lines: string[], accent = '#ff3dd2'): void {
    // The cover art carries the logo; the title screen shows it rather than a second title.
    const logo = title === 'NEON KNUCKLES' && ready(this.cover);
    const g = this.g;
    g.save();
    if (ready(this.cover)) {
      const c = this.cover;
      const k = Math.max(W / c.naturalWidth, H / c.naturalHeight);
      g.drawImage(c, (W - c.naturalWidth * k) / 2, (H - c.naturalHeight * k) / 2, c.naturalWidth * k, c.naturalHeight * k);
      // Dark at the centre, where the text sits, and scanlines for the arcade cabinet.
      const veil = g.createLinearGradient(0, 0, 0, H);
      veil.addColorStop(0, 'rgba(5,2,12,0.35)');
      veil.addColorStop(0.3, 'rgba(5,2,12,0.72)');
      veil.addColorStop(0.75, 'rgba(5,2,12,0.72)');
      veil.addColorStop(1, 'rgba(5,2,12,0.4)');
      g.fillStyle = veil;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    } else {
      g.fillStyle = 'rgba(5,2,12,0.78)';
      g.fillRect(0, 0, W, H);
    }
    g.textAlign = 'center';
    g.font = '900 72px "Space Grotesk Variable", system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.shadowColor = accent;
    g.shadowBlur = 34;
    if (!logo) g.fillText(title, W / 2, 170);
    g.shadowBlur = 0;
    const top = logo ? 300 : 230;
    lines.forEach((line, i) => {
      const heading = i === 0;
      g.font = heading ? '700 20px "Space Grotesk Variable", system-ui, sans-serif' : '500 16px "Space Grotesk Variable", system-ui, sans-serif';
      g.fillStyle = heading ? accent : '#d9cfe8';
      g.fillText(line, W / 2, top + i * 30);
    });
    g.restore();
  }
}
