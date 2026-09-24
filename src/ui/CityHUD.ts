import { installRushTheme } from './RushTheme';

/**
 * VORIXA City's HUD (ADR-0014), in the shared glass theme: the click-to-play card, a dynamic
 * crosshair with hit markers, ammunition and weapon slots, health and armour, a direction arc
 * toward whoever is shooting, a kill feed, wave banners and the "down" card.
 */

export interface SlotInfo {
  key: string;
  name: string;
  owned: boolean;
}

const CSS = /* css */ `
body.rush #hud, body.rush #overlay-canvas { display: none !important; }
#rush-hud.city { position: absolute; inset: 0; pointer-events: none; user-select: none; }
#rush-hud.city [hidden] { display: none !important; }
#rush-hud.city .card {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: auto; text-align: center;
  width: min(620px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; padding: 26px 28px 24px;
}
#rush-hud.city .kicker { font-family: var(--t-body); font-style: normal; font-size: 13px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--t-muted); margin: 0 0 4px; }
#rush-hud.city h1 { margin: 0; font-size: clamp(44px, 8vw, 76px); line-height: 0.9; text-transform: uppercase; }
#rush-hud.city h1 span { color: var(--t-accent); }
#rush-hud.city .lede { margin: 12px auto 16px; max-width: 48ch; font-size: 15px; line-height: 1.5; opacity: 0.9; }
#rush-hud.city .keys { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 16px; text-align: left; margin: 0 auto; max-width: 460px; }
#rush-hud.city .keys div { display: flex; justify-content: space-between; gap: 12px; font-family: var(--t-body); font-style: normal; font-size: 14px; }
#rush-hud.city .keys span { color: var(--t-muted); }
#rush-hud.city .btn { font-size: 20px; padding: 11px 22px; margin-top: 18px; cursor: pointer; }
#rush-hud.city .bar { height: 6px; border-radius: 3px; margin: 18px auto 0; max-width: 320px; background: var(--t-faint); overflow: hidden; }
#rush-hud.city .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--t-accent), var(--t-gold)); transition: width 0.2s ease-out; }

#rush-hud.city .crosshair { position: absolute; left: 50%; top: 50%; width: 0; height: 0; opacity: 0.9; transition: opacity 0.12s; }
#rush-hud.city .crosshair i { position: absolute; background: rgba(255,255,255,0.95); box-shadow: 0 0 2px rgba(0,0,0,0.7); transition: transform 0.06s linear; }
#rush-hud.city .crosshair .t, #rush-hud.city .crosshair .b { width: 2px; height: 8px; left: -1px; }
#rush-hud.city .crosshair .l, #rush-hud.city .crosshair .r { height: 2px; width: 8px; top: -1px; }
#rush-hud.city .crosshair .dot { width: 2px; height: 2px; left: -1px; top: -1px; }
#rush-hud.city .crosshair.hidden { opacity: 0; }
#rush-hud.city .hitmark { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; margin: -13px 0 0 -13px; opacity: 0; }
#rush-hud.city .hitmark::before, #rush-hud.city .hitmark::after { content: ''; position: absolute; left: 12px; top: -2px; width: 2px; height: 30px; background: #fff; box-shadow: 0 0 3px rgba(0,0,0,0.6); }
#rush-hud.city .hitmark::before { transform: rotate(45deg); }
#rush-hud.city .hitmark::after { transform: rotate(-45deg); }
#rush-hud.city .hitmark.kill::before, #rush-hud.city .hitmark.kill::after { background: var(--t-bad); }
#rush-hud.city .hitmark.show { animation: city-hit 0.22s ease-out; }
@keyframes city-hit { from { opacity: 1; transform: scale(1.25); } to { opacity: 0; transform: scale(0.9); } }

#rush-hud.city .place { position: absolute; left: 20px; top: max(16px, env(safe-area-inset-top)); }
#rush-hud.city .place b { display: block; font-size: 30px; text-transform: uppercase; }
#rush-hud.city .place small { font-family: var(--t-body); font-style: normal; font-size: 13px; color: var(--t-muted); letter-spacing: 0.14em; text-transform: uppercase; }
#rush-hud.city .wave { margin-top: 6px; font-size: 18px; }
#rush-hud.city .wave b { font-size: 18px; display: inline; color: var(--t-gold); }

#rush-hud.city .vitals { position: absolute; left: 20px; bottom: max(20px, env(safe-area-inset-bottom)); width: min(260px, 40vw); display: grid; gap: 6px; }
#rush-hud.city .meter { height: 8px; border-radius: 4px; background: var(--t-faint); overflow: hidden; box-shadow: 0 0 0 1px var(--t-hair); }
#rush-hud.city .meter i { display: block; height: 100%; width: 100%; transition: width 0.15s ease-out; }
#rush-hud.city .meter.hp i { background: linear-gradient(90deg, #3ddc84, #8cf2b8); }
#rush-hud.city .meter.hp.low i { background: linear-gradient(90deg, #ff4d5e, #ff8a8a); }
#rush-hud.city .meter.armor i { background: linear-gradient(90deg, #3f8cff, #8cc2ff); }
#rush-hud.city .vitals small { font-family: var(--t-body); font-style: normal; font-size: 12px; color: var(--t-muted); letter-spacing: 0.12em; text-transform: uppercase; }

#rush-hud.city .weapon { position: absolute; right: 20px; bottom: max(20px, env(safe-area-inset-bottom)); text-align: right; }
#rush-hud.city .ammo { font-size: 46px; line-height: 1; font-variant-numeric: tabular-nums; }
#rush-hud.city .ammo small { font-size: 22px; color: var(--t-muted); }
#rush-hud.city .ammo.empty { color: var(--t-bad); }
#rush-hud.city .gunname { font-size: 18px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--t-muted); }
#rush-hud.city .slots { display: flex; gap: 4px; justify-content: flex-end; margin-top: 8px; }
#rush-hud.city .slots span { font-family: var(--t-body); font-style: normal; font-size: 11px; padding: 3px 7px; border-radius: 5px; background: var(--t-faint); color: var(--t-muted); border: 1px solid var(--t-hair); }
#rush-hud.city .slots span.on { background: var(--t-accent); color: #fff; border-color: transparent; }
#rush-hud.city .slots span.none { opacity: 0.35; }
#rush-hud.city .reload { position: absolute; left: 50%; top: calc(50% + 34px); transform: translateX(-50%); font-size: 16px; letter-spacing: 0.14em; text-transform: uppercase; }

#rush-hud.city .feed { position: absolute; right: 20px; top: max(16px, env(safe-area-inset-top)); display: grid; gap: 4px; justify-items: end; }
#rush-hud.city .feed div { font-size: 16px; padding: 4px 10px; border-radius: 6px; background: var(--t-glass); border: 1px solid var(--t-hair); animation: city-feed 3s ease-out forwards; }
#rush-hud.city .feed div.head { color: var(--t-gold); }
@keyframes city-feed { 0% { opacity: 0; transform: translateX(12px); } 8% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; } }

#rush-hud.city .dmg { position: absolute; left: 50%; top: 50%; width: 180px; height: 180px; margin: -90px 0 0 -90px; opacity: 0; }
#rush-hud.city .dmg::before { content: ''; position: absolute; left: 50%; top: 0; width: 70px; height: 18px; margin-left: -35px; border-radius: 50% 50% 0 0 / 100% 100% 0 0; background: radial-gradient(ellipse at 50% 100%, rgba(255,60,70,0.85), rgba(255,60,70,0) 70%); }
#rush-hud.city .dmg.show { animation: city-dmg 0.9s ease-out; }
@keyframes city-dmg { from { opacity: 1; } to { opacity: 0; } }
#rush-hud.city .vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 55%, rgba(160,10,20,0.55)); opacity: 0; transition: opacity 0.3s; }

#rush-hud.city .banner { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); text-align: center; white-space: nowrap; opacity: 0; }
#rush-hud.city .banner b { display: block; font-size: clamp(34px, 6vw, 60px); text-transform: uppercase; color: var(--t-gold); }
#rush-hud.city .banner small { font-family: var(--t-body); font-style: normal; font-size: 15px; color: var(--t-text); }
#rush-hud.city .banner.show { animation: city-banner 3s ease-out forwards; }
@keyframes city-banner { 0% { opacity: 0; transform: translateX(-50%) scale(0.9); } 10% { opacity: 1; transform: translateX(-50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }

#rush-hud.city .down h1 { color: var(--t-bad); }
#rush-hud.city .car { position: absolute; right: 20px; bottom: max(20px, env(safe-area-inset-bottom)); text-align: right; }
#rush-hud.city .car .kmh { font-size: 64px; line-height: 0.9; font-variant-numeric: tabular-nums; }
#rush-hud.city .car .kmh small { font-size: 18px; color: var(--t-muted); margin-left: 4px; }
#rush-hud.city .car .meter { width: 180px; margin: 8px 0 0 auto; }
#rush-hud.city .car .meter i { background: linear-gradient(90deg, #ffc23d, #ffe08a); }
#rush-hud.city .prompt { position: absolute; left: 50%; bottom: max(90px, calc(env(safe-area-inset-bottom) + 90px)); transform: translateX(-50%); font-size: 18px; padding: 8px 14px; border-radius: 10px; }
#rush-hud.city.driving .weapon, #rush-hud.city.driving .crosshair { display: none; }
#rush-hud.city .corner { position: absolute; right: 20px; bottom: calc(max(20px, env(safe-area-inset-bottom)) + 110px); }
#rush-hud.city .chip { font-size: 13px; padding: 5px 10px; border-radius: 999px; }
@media (max-width: 640px) { #rush-hud.city .keys { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { #rush-hud.city * { animation-duration: 0.01ms !important; } }
`;

const MARKUP = `
  <div class="vignette"></div>
  <div class="place toon"><small>VORIXA City</small><b>Downtown</b><div class="wave">Enemies <b class="left">0</b></div></div>
  <div class="crosshair" aria-hidden="true"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
  <div class="hitmark" aria-hidden="true"></div>
  <div class="dmg" aria-hidden="true"></div>
  <div class="reload toon" hidden>Reloading</div>
  <div class="feed" aria-live="polite"></div>
  <div class="banner toon" role="status" aria-live="polite"><b></b><small></small></div>
  <div class="vitals">
    <small>Health</small><div class="meter hp" role="meter" aria-label="Health"><i></i></div>
    <small>Armour</small><div class="meter armor" role="meter" aria-label="Armour"><i></i></div>
  </div>
  <div class="weapon toon">
    <div class="ammo" aria-label="Ammunition"><span class="mag">12</span> <small>/ <span class="reserve">48</span></small></div>
    <div class="gunname">Pistol</div>
    <div class="slots"></div>
  </div>
  <div class="corner"><span class="chip view">Third person <kbd>V</kbd></span></div>
  <div class="car toon" hidden>
    <div class="kmh"><span>0</span><small>km/h</small></div>
    <div class="meter" role="meter" aria-label="Car condition"><i></i></div>
  </div>
  <div class="prompt chip" hidden>Get in <kbd>F</kbd></div>
  <section class="card intro" aria-labelledby="city-title">
    <p class="kicker">Chapter 1 · Preview</p>
    <h1 id="city-title">VORIXA <span>City</span></h1>
    <p class="lede">A crew has taken the downtown intersection. Clear them out: aim down the sights, control your recoil, reload behind cover, pick up the ammo they drop.</p>
    <div class="keys">
      <div>Move <span>W A S D</span></div>
      <div>Look <span>Mouse</span></div>
      <div>Fire <span>Left mouse</span></div>
      <div>Aim <span>Right mouse</span></div>
      <div>Reload <span>R</span></div>
      <div>Weapons <span>1 – 5, wheel</span></div>
      <div>Sprint · Jump <span>Shift · Space</span></div>
      <div>First / third person <span>V</span></div>
      <div>Get in / out of a car <span>F</span></div>
      <div>Drive · handbrake <span>W A S D · Space</span></div>
    </div>
    <div class="bar" role="progressbar" aria-label="Loading the city" aria-valuemin="0" aria-valuemax="100"><i></i></div>
    <button class="btn primary play" type="button" disabled>Loading…</button>
    <button class="btn back" type="button">Back to Rush</button>
  </section>
  <section class="card down" hidden aria-labelledby="city-down">
    <p class="kicker">You went down</p>
    <h1 id="city-down">Wasted</h1>
    <p class="lede down-stats"></p>
    <button class="btn primary respawn" type="button">Get back up <kbd>R</kbd></button>
  </section>
`;

export class CityHUD {
  public onPlay: () => void = () => {};
  public onBack: () => void = () => {};
  public onRespawn: () => void = () => {};
  private readonly root: HTMLElement;
  private readonly q: <T extends HTMLElement>(s: string) => T;
  private readonly last = { mag: -1, reserve: -1, hp: -1, armor: -1, left: -1, slot: '' };

  public constructor(container: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    document.body.classList.add('rush');
    installRushTheme();
    this.root = document.createElement('div');
    this.root.id = 'rush-hud';
    this.root.className = 'city';
    this.root.innerHTML = MARKUP;
    container.appendChild(this.root);
    this.q = <T extends HTMLElement>(s: string) => this.root.querySelector<T>(s)!;
    this.q('.play').addEventListener('click', () => this.onPlay());
    this.q('.back').addEventListener('click', () => this.onBack());
    this.q('.respawn').addEventListener('click', () => this.onRespawn());
  }

  public progress(share: number): void {
    const pct = Math.round(share * 100);
    (this.q('.bar').firstElementChild as HTMLElement).style.width = `${pct}%`;
    this.q('.bar').setAttribute('aria-valuenow', String(pct));
  }

  public loaded(): void {
    this.q('.bar').hidden = true;
    const play = this.q<HTMLButtonElement>('.play');
    play.disabled = false;
    play.textContent = 'Click to play';
    play.focus({ preventScroll: true });
  }

  public failed(message: string): void {
    this.q('.play').textContent = message;
  }

  public showCard(on: boolean, resumed = false): void {
    this.q('.card.intro').hidden = !on;
    if (on && resumed) this.q('.play').textContent = 'Click to continue';
  }

  public showDown(on: boolean, stats = ''): void {
    this.q('.card.down').hidden = !on;
    this.q('.down-stats').textContent = stats;
    if (on) this.q('.respawn').focus({ preventScroll: true });
  }

  public setView(first: boolean): void {
    this.q('.view').firstChild!.textContent = first ? 'First person ' : 'Third person ';
  }

  /** @param spread The current bullet spread, radians, drawn as the crosshair's gap. */
  public setCrosshair(visible: boolean, spread: number, fovDeg: number): void {
    const c = this.q('.crosshair');
    c.classList.toggle('hidden', !visible);
    const px = Math.min(60, 4 + (spread / ((fovDeg * Math.PI) / 180)) * window.innerHeight);
    const set = (cls: string, x: number, y: number) => ((this.q(`.crosshair .${cls}`)).style.transform = `translate(${x}px, ${y}px)`);
    set('t', 0, -px - 8);
    set('b', 0, px);
    set('l', -px - 8, 0);
    set('r', px, 0);
  }

  public hitMarker(kill: boolean): void {
    const h = this.q('.hitmark');
    h.classList.toggle('kill', kill);
    h.classList.remove('show');
    void h.offsetWidth;
    h.classList.add('show');
  }

  /** @param angle Where the damage came from, relative to the view: 0 ahead, clockwise. */
  public damageFrom(angle: number): void {
    const d = this.q('.dmg');
    d.style.transform = `rotate(${angle}rad)`;
    d.classList.remove('show');
    void d.offsetWidth;
    d.classList.add('show');
  }

  public setVitals(hp: number, armor: number): void {
    const l = this.last;
    if (Math.round(hp) !== l.hp) {
      l.hp = Math.round(hp);
      (this.q('.meter.hp i')).style.width = `${hp}%`;
      this.q('.meter.hp').classList.toggle('low', hp < 30);
      this.q('.meter.hp').setAttribute('aria-valuenow', String(l.hp));
      this.q('.vignette').style.opacity = String(Math.max(0, (35 - hp) / 35));
    }
    if (Math.round(armor) !== l.armor) {
      l.armor = Math.round(armor);
      (this.q('.meter.armor i')).style.width = `${(armor / 50) * 100}%`;
    }
  }

  public setWeapon(name: string, mag: number, reserve: number, reloading: boolean, slots: SlotInfo[], current: number): void {
    const l = this.last;
    if (mag !== l.mag) {
      l.mag = mag;
      this.q('.mag').textContent = String(mag);
      this.q('.ammo').classList.toggle('empty', mag === 0);
    }
    if (reserve !== l.reserve) {
      l.reserve = reserve;
      this.q('.reserve').textContent = String(reserve);
    }
    this.q('.reload').hidden = !reloading;
    const slotKey = `${current}|${slots.map((s) => (s.owned ? 1 : 0)).join('')}`;
    if (slotKey !== l.slot) {
      l.slot = slotKey;
      this.q('.gunname').textContent = name;
      const box = this.q('.slots');
      box.replaceChildren(
        ...slots.map((s, i) => {
          const el = document.createElement('span');
          el.textContent = `${s.key} ${s.name}`;
          if (i === current) el.className = 'on';
          else if (!s.owned) el.className = 'none';
          return el;
        })
      );
    }
  }

  /** The speedometer and car condition while driving; the "get in" prompt near a car. */
  public setVehicle(car: { speed: number; health: number } | null, canEnter: boolean): void {
    this.root.classList.toggle('driving', car !== null);
    this.q('.car').hidden = car === null;
    this.q('.prompt').hidden = !canEnter;
    if (!car) return;
    this.q('.car .kmh span').textContent = String(Math.round(car.speed * 3.6));
    (this.q('.car .meter i')).style.width = `${Math.max(0, car.health)}%`;
  }

  public setEnemies(left: number): void {
    if (left === this.last.left) return;
    this.last.left = left;
    this.q('.left').textContent = String(left);
  }

  public feed(text: string, headshot = false): void {
    const el = document.createElement('div');
    el.textContent = text;
    if (headshot) el.className = 'head';
    const feed = this.q('.feed');
    feed.prepend(el);
    while (feed.children.length > 5) feed.lastElementChild!.remove();
    setTimeout(() => el.remove(), 3100);
  }

  public banner(title: string, sub = ''): void {
    const b = this.q('.banner');
    b.querySelector('b')!.textContent = title;
    b.querySelector('small')!.textContent = sub;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }
}
