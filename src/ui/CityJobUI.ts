/**
 * The story layer of VORIXA City: HEAT (ADR-0014): storyboards (comic panels with portraits of
 * the crew), the objective panel with its countdown, the job-failed card, cash, and the radar
 * minimap. Sits inside the city HUD and wears the same glass theme.
 */

export interface StoryPanel {
  name: string;
  alias: string;
  line: string;
  /** Portrait image URL, or null for the Choir (drawn as a red silhouette). */
  portrait: string | null;
  /** Accent colour for the panel, from the speaker's palette. */
  accent: string;
  villain: boolean;
}

export interface Blip {
  x: number;
  z: number;
  kind: 'enemy' | 'police' | 'boss' | 'objective' | 'coin' | 'car' | 'outpost' | 'ours' | 'wolf' | 'animal';
}

const CSS = /* css */ `
#rush-hud.city .story { position: absolute; inset: 0; pointer-events: auto; cursor: pointer; background: radial-gradient(ellipse at center, rgba(5,6,10,0.55), rgba(5,6,10,0.92)); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 24px; }
#rush-hud.city .story[hidden] { display: none; }
#rush-hud.city .story .jobtitle { text-align: center; }
#rush-hud.city .story .jobtitle small { display: block; font-family: var(--t-body); font-style: normal; font-size: 13px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--t-muted); }
#rush-hud.city .story .jobtitle b { display: block; font-size: clamp(40px, 7vw, 72px); line-height: 0.95; text-transform: uppercase; }
#rush-hud.city .story .strip { display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; max-width: 1100px; }
#rush-hud.city .panel { width: min(330px, 86vw); border-radius: 14px; overflow: hidden; background: var(--t-glass-strong); border: 1px solid var(--t-hair); box-shadow: var(--t-shadow); opacity: 0; transform: translateY(14px) rotate(-0.6deg); transition: opacity 0.35s ease-out, transform 0.35s ease-out; }
#rush-hud.city .panel:nth-child(even) { transform: translateY(14px) rotate(0.6deg); }
#rush-hud.city .panel.shown { opacity: 1; transform: none; }
#rush-hud.city .panel .art { position: relative; height: 170px; background: linear-gradient(160deg, var(--accent), #0b0c12 75%); }
#rush-hud.city .panel .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; mix-blend-mode: normal; }
#rush-hud.city .panel .art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 55%, rgba(8,9,14,0.85)), linear-gradient(90deg, var(--accent) 0, transparent 30%); opacity: 0.55; mix-blend-mode: screen; pointer-events: none; }
#rush-hud.city .panel .art .ghost { position: absolute; inset: 0; display: grid; place-items: center; font-size: 96px; color: rgba(0,0,0,0.55); text-shadow: 0 0 24px rgba(255,40,60,0.8); }
#rush-hud.city .panel .who { padding: 10px 14px 0; font-size: 20px; text-transform: uppercase; }
#rush-hud.city .panel .who span { color: var(--accent); font-size: 14px; margin-left: 6px; }
#rush-hud.city .panel p { margin: 4px 14px 14px; font-family: var(--t-body); font-style: normal; font-size: 15px; line-height: 1.5; }
#rush-hud.city .panel.villain .who { color: #ff4d5e; }
#rush-hud.city .story .next { font-size: 16px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--t-muted); }

#rush-hud.city .objective { position: absolute; left: 50%; top: max(14px, env(safe-area-inset-top)); transform: translateX(-50%); min-width: 280px; max-width: min(520px, 70vw); text-align: center; padding: 8px 16px 10px; border-radius: 12px; background: var(--t-glass); border: 1px solid var(--t-hair); }
#rush-hud.city .objective[hidden] { display: none; }
#rush-hud.city .objective small { display: block; font-family: var(--t-body); font-style: normal; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--t-accent); }
#rush-hud.city .objective b { display: block; font-size: 20px; text-transform: uppercase; }
#rush-hud.city .objective .meta { font-family: var(--t-body); font-style: normal; font-size: 13px; color: var(--t-muted); }
#rush-hud.city .objective .clock { color: var(--t-gold); font-variant-numeric: tabular-nums; font-weight: 700; }
#rush-hud.city .objective .clock.low { color: var(--t-bad); }
#rush-hud.city .cash { position: absolute; left: 20px; top: calc(max(16px, env(safe-area-inset-top)) + 118px); font-size: 24px; color: #7dffa8; text-shadow: 0 2px 10px rgba(0,0,0,0.5); font-variant-numeric: tabular-nums; }
#rush-hud.city .radar { position: absolute; left: 20px; bottom: calc(max(20px, env(safe-area-inset-bottom)) + 86px); width: 168px; height: 168px; border-radius: 50%; overflow: hidden; border: 1px solid var(--t-hair); box-shadow: var(--t-shadow); background: rgba(10,12,18,0.72); }
#rush-hud.city .fail { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: auto; text-align: center; width: min(460px, calc(100vw - 32px)); padding: 24px; }
#rush-hud.city .fail[hidden] { display: none; }
#rush-hud.city .fail h1 { color: var(--t-bad); font-size: clamp(38px, 6vw, 60px); margin: 0; text-transform: uppercase; }
#rush-hud.city .fail p { font-family: var(--t-body); font-style: normal; }
#rush-hud.city.in-story > :not(.story) { visibility: hidden; }
@media (max-width: 700px) { #rush-hud.city .radar { width: 120px; height: 120px; } }
`;

export class CityJobUI {
  public onContinue: () => void = () => {};
  public onRetry: () => void = () => {};
  private readonly root: HTMLElement;
  private readonly story: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly radar: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly fail: HTMLElement;
  private readonly cash: HTMLElement;
  private panels: HTMLElement[] = [];
  private shown = 0;
  private lastCash = -1;

  public constructor(hud: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = hud;
    const make = (tag: string, cls: string, html = '') => {
      const el = document.createElement(tag);
      el.className = cls;
      el.innerHTML = html;
      hud.appendChild(el);
      return el;
    };
    this.story = make('section', 'story', '<div class="jobtitle"><small></small><b></b></div><div class="strip"></div><div class="next toon">Click or press Space</div>');
    this.story.hidden = true;
    this.story.setAttribute('aria-live', 'polite');
    this.strip = this.story.querySelector('.strip')!;
    this.objective = make('div', 'objective', '<small></small><b></b><div class="meta"></div>');
    this.objective.hidden = true;
    this.cash = make('div', 'cash toon', '$0');
    this.radar = make('canvas', 'radar') as HTMLCanvasElement;
    this.radar.width = this.radar.height = 336;
    this.radar.setAttribute('aria-hidden', 'true');
    this.g = this.radar.getContext('2d')!;
    this.fail = make('section', 'card fail', '<p class="kicker">Job failed</p><h1></h1><p class="why"></p><button class="btn primary retry" type="button">Retry <kbd>R</kbd></button>');
    this.fail.hidden = true;
    this.story.addEventListener('click', () => this.onContinue());
    this.fail.querySelector('.retry')!.addEventListener('click', () => this.onRetry());
  }

  public get storyOpen(): boolean {
    return !this.story.hidden;
  }

  public get failOpen(): boolean {
    return !this.fail.hidden;
  }

  /** Opens a storyboard: panels appear one by one as the player continues. */
  public showStory(kicker: string, title: string, panels: StoryPanel[]): void {
    this.story.querySelector('.jobtitle small')!.textContent = kicker;
    this.story.querySelector('.jobtitle b')!.textContent = title;
    this.panels = panels.map((p) => {
      const el = document.createElement('article');
      el.className = `panel${p.villain ? ' villain' : ''}`;
      el.style.setProperty('--accent', p.accent);
      const art = document.createElement('div');
      art.className = 'art';
      if (p.portrait) {
        const img = document.createElement('img');
        img.src = p.portrait;
        img.alt = p.name;
        art.appendChild(img);
      } else {
        const ghost = document.createElement('div');
        ghost.className = 'ghost';
        ghost.textContent = '♜';
        art.appendChild(ghost);
      }
      const who = document.createElement('div');
      who.className = 'who';
      who.textContent = p.name;
      if (p.alias) {
        const alias = document.createElement('span');
        alias.textContent = p.alias;
        who.appendChild(alias);
      }
      const line = document.createElement('p');
      line.textContent = p.line;
      el.append(art, who, line);
      return el;
    });
    this.strip.replaceChildren(...this.panels);
    this.shown = 0;
    this.story.hidden = false;
    this.root.classList.add('in-story');
    this.reveal();
  }

  /** Shows the next panel; returns false when all are already showing (time to close). */
  public reveal(): boolean {
    if (this.shown >= this.panels.length) return false;
    const p = this.panels[this.shown++];
    requestAnimationFrame(() => p.classList.add('shown'));
    return true;
  }

  public closeStory(): void {
    this.story.hidden = true;
    this.root.classList.remove('in-story');
  }

  public setObjective(job: string | null, text = '', meta = '', time: number | null = null): void {
    this.objective.hidden = job === null;
    if (job === null) return;
    this.objective.querySelector('small')!.textContent = job;
    this.objective.querySelector('b')!.textContent = text;
    const m = this.objective.querySelector('.meta')!;
    m.replaceChildren();
    if (time !== null) {
      const clock = document.createElement('span');
      clock.className = `clock${time < 10 ? ' low' : ''}`;
      clock.textContent = `${Math.floor(time / 60)}:${String(Math.ceil(time % 60) % 60).padStart(2, '0')}`;
      m.append(clock, document.createTextNode(meta ? ` · ${meta}` : ''));
    } else m.textContent = meta;
  }

  public showFail(on: boolean, title = '', why = ''): void {
    this.fail.hidden = !on;
    if (!on) return;
    this.fail.querySelector('h1')!.textContent = title;
    this.fail.querySelector('.why')!.textContent = why;
    this.fail.querySelector<HTMLElement>('.retry')?.focus({ preventScroll: true });
  }

  public setCash(cash: number): void {
    if (cash === this.lastCash) return;
    this.lastCash = cash;
    this.cash.textContent = `$${cash.toLocaleString('en-US')}`;
  }

  /**
   * The radar: roads, the hero at the centre pointing up the camera's view, and blips.
   * @param roads Road centre lines as [x or z, isAlongX].
   */
  public drawRadar(heroX: number, heroZ: number, yaw: number, roads: { pitch: number; count: number }, blips: readonly Blip[]): void {
    const g = this.g;
    const size = this.radar.width;
    const half = size / 2;
    const scale = 2.1; // pixels per metre
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.fillStyle = 'rgba(12,14,22,0.9)';
    g.fillRect(0, 0, size, size);
    // Map space: rotate so the camera's view points up.
    g.translate(half, half);
    g.rotate(yaw);
    g.translate(-heroX * scale, -heroZ * scale);
    g.strokeStyle = 'rgba(160,170,190,0.45)';
    g.lineWidth = 18 * scale * 0.5;
    const extent = roads.pitch * (roads.count - 1);
    for (let i = 0; i < roads.count; i++) {
      const c = i * roads.pitch * scale;
      g.beginPath();
      g.moveTo(-10 * scale, c);
      g.lineTo((extent + 10) * scale, c);
      g.moveTo(c, -10 * scale);
      g.lineTo(c, (extent + 10) * scale);
      g.stroke();
    }
    const colours: Record<Blip['kind'], string> = {
      enemy: '#ff4d5e', police: '#4f8cff', boss: '#ff2b8a', objective: '#ffc23d', coin: '#ffe36a', car: '#9aa3b5', outpost: '#ff3b4a', ours: '#8a6cf0', wolf: '#ff9a3c', animal: '#c9b38a'
    };
    const edge = (half - 14) / scale;
    for (const b of blips) {
      g.fillStyle = colours[b.kind];
      const r = b.kind === 'objective' || b.kind === 'boss' || b.kind === 'outpost' ? 9 : b.kind === 'car' || b.kind === 'animal' ? 4 : 6;
      let x = b.x;
      let z = b.z;
      const dx = x - heroX;
      const dz = z - heroZ;
      const d = Math.hypot(dx, dz);
      // Objectives and bosses beyond the radar's reach sit on its rim, pointing the way (GTA).
      if (d > edge) {
        if (b.kind !== 'objective' && b.kind !== 'boss' && b.kind !== 'outpost') continue;
        x = heroX + (dx / d) * edge;
        z = heroZ + (dz / d) * edge;
      }
      g.beginPath();
      if (b.kind === 'outpost' || b.kind === 'ours') {
        // Outposts are diamonds, Far Cry's mark for a place to take.
        g.moveTo(x * scale, z * scale - r);
        g.lineTo(x * scale + r, z * scale);
        g.lineTo(x * scale, z * scale + r);
        g.lineTo(x * scale - r, z * scale);
        g.closePath();
      } else g.arc(x * scale, z * scale, r, 0, Math.PI * 2);
      g.fill();
      if (b.kind === 'objective') {
        g.strokeStyle = 'rgba(255,194,61,0.6)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x * scale, z * scale, 16, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // The hero: an arrow at the centre, pointing where the camera looks (up).
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(half, half - 13);
    g.lineTo(half + 9, half + 10);
    g.lineTo(half, half + 5);
    g.lineTo(half - 9, half + 10);
    g.closePath();
    g.fill();
  }
}
