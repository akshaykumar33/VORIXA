import { installRushTheme } from './RushTheme';

/** One crew member as the Safehouse lists them. */
export interface CrewEntry {
  name: string;
  alias: string;
  role: string;
  bio: string;
  perkName: string;
  perkText: string;
  unlocked: boolean;
  /** Why it is locked, e.g. "Clear 3 waves". */
  lockText: string;
  current: boolean;
}

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
#rush-hud.city .posts { margin-top: 4px; font-size: 15px; color: var(--t-text); }
#rush-hud.city .posts b { font-size: 15px; display: inline; color: var(--t-gold); }
#rush-hud.city .alarm { display: inline-block; margin-top: 8px; font-size: 14px; padding: 5px 12px; border-radius: 999px; letter-spacing: 0.08em; text-transform: uppercase;
  background: rgba(255,194,61,0.18); color: #ffd36b; border: 1px solid rgba(255,194,61,0.55); }
#rush-hud.city .alarm.ringing { background: rgba(255,43,60,0.25); color: #ff6b78; border-color: rgba(255,77,94,0.8); animation: city-alarm 0.5s steps(2) infinite; }
@keyframes city-alarm { 50% { background: rgba(255,43,60,0.55); color: #fff; } }
@media (prefers-reduced-motion: reduce) { #rush-hud.city .alarm.ringing { animation: none; } }
#rush-hud.city .takedown { position: absolute; left: 50%; bottom: max(140px, calc(env(safe-area-inset-bottom) + 140px)); transform: translateX(-50%); font-size: 18px; padding: 8px 14px; border-radius: 10px; }

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
#rush-hud.city .heat { margin-top: 6px; font-size: 20px; letter-spacing: 0.08em; }
#rush-hud.city .heat span { color: rgba(255,255,255,0.18); transition: color 0.2s; }
#rush-hud.city .heat span.on { color: var(--t-gold); text-shadow: 0 0 8px rgba(255,194,61,0.8); }
#rush-hud.city .heat.flash span.on { animation: city-heat 0.5s ease-in-out 3; }
@keyframes city-heat { 50% { color: #ff4d5e; text-shadow: 0 0 10px rgba(255,77,94,0.9); } }
#rush-hud.city .card.safehouse { left: auto; right: max(20px, 3vw); transform: translateY(-50%); width: min(440px, calc(100vw - 32px)); text-align: left; }
#rush-hud.city .safehouse h1 { font-size: clamp(38px, 5vw, 56px); }
#rush-hud.city .safehouse .alias { font-size: 22px; color: var(--t-accent); text-transform: uppercase; letter-spacing: 0.04em; }
#rush-hud.city .safehouse .role { font-family: var(--t-body); font-style: normal; font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--t-muted); margin-top: 2px; }
#rush-hud.city .safehouse .bio { font-family: var(--t-body); font-style: normal; font-size: 15px; line-height: 1.5; margin: 12px 0; }
#rush-hud.city .safehouse .perk { padding: 10px 12px; border-radius: 10px; background: var(--t-faint); border: 1px solid var(--t-hair); }
#rush-hud.city .safehouse .perk b { display: block; font-size: 18px; color: var(--t-gold); }
#rush-hud.city .safehouse .perk span { font-family: var(--t-body); font-style: normal; font-size: 14px; }
#rush-hud.city .safehouse .roster { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-top: 14px; }
#rush-hud.city .safehouse .roster button { font-family: var(--t-display); font-style: italic; font-size: 14px; padding: 8px 4px; border-radius: 8px; cursor: pointer; text-transform: uppercase;
  background: var(--t-glass); color: var(--t-text); border: 1px solid var(--t-hair); }
#rush-hud.city .safehouse .roster button[aria-pressed="true"] { border-color: var(--t-accent); box-shadow: 0 0 0 1px var(--t-accent); }
#rush-hud.city .safehouse .roster button.locked { opacity: 0.45; }
#rush-hud.city .safehouse .roster button:focus-visible { outline: 2px solid var(--t-gold); outline-offset: 2px; }
#rush-hud.city .safehouse .lock { font-family: var(--t-body); font-style: normal; font-size: 13px; color: var(--t-bad); margin-top: 8px; min-height: 1.2em; }
#rush-hud.city .safehouse .row { display: flex; gap: 10px; flex-wrap: wrap; }
#rush-hud.city .car { position: absolute; right: 20px; bottom: max(20px, env(safe-area-inset-bottom)); text-align: right; }
#rush-hud.city .car .kmh { font-size: 64px; line-height: 0.9; font-variant-numeric: tabular-nums; }
#rush-hud.city .car .kmh small { font-size: 18px; color: var(--t-muted); margin-left: 4px; }
#rush-hud.city .car .meter { width: 180px; margin: 8px 0 0 auto; }
#rush-hud.city .car .meter i { background: linear-gradient(90deg, #ffc23d, #ffe08a); }
#rush-hud.city .prompt { position: absolute; left: 50%; bottom: max(90px, calc(env(safe-area-inset-bottom) + 90px)); transform: translateX(-50%); font-size: 18px; padding: 8px 14px; border-radius: 10px; }
#rush-hud.city.driving .weapon, #rush-hud.city.driving .crosshair { display: none; }
#rush-hud.city.in-safehouse > :not(.card.safehouse) { visibility: hidden; }
#rush-hud.city .corner { position: absolute; right: 20px; bottom: calc(max(20px, env(safe-area-inset-bottom)) + 110px); }
#rush-hud.city .chip { font-size: 13px; padding: 5px 10px; border-radius: 999px; }
@media (max-width: 640px) { #rush-hud.city .keys { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { #rush-hud.city * { animation-duration: 0.01ms !important; } }
`;

const MARKUP = `
  <div class="vignette"></div>
  <div class="place toon"><small>VORIXA City</small><b>Downtown</b><div class="wave">Enemies <b class="left">0</b></div><div class="posts">Outposts <b class="freed">0</b> / <span class="posts-of">5</span></div><div class="heat" role="img" aria-label="Heat: 0 stars"><span>★</span><span>★</span><span>★</span><span>★</span><span>★</span></div><div class="alarm" role="status" aria-live="assertive" hidden></div></div>
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
  <div class="takedown chip" hidden><span>Takedown</span> <kbd>E</kbd></div>
  <section class="card intro" aria-labelledby="city-title">
    <p class="kicker">VORIXA City · HEAT · Chapter 1</p>
    <h1 id="city-title">VORIXA <span>City</span></h1>
    <p class="lede">The Choir owns this city. Your crew is taking it back, one job at a time: steal their cars, hit their stash, lose the heat, take their stars, and face Cantor. Take back their five outposts: quietly, or with everything that burns. Press H for the Safehouse and pick who you play.</p>
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
      <div>Silent takedown, from behind · climb a ladder <span>E</span></div>
      <div>Glider (in the air, from a height) <span>Space</span></div>
      <div>Drive · handbrake <span>W A S D · Space</span></div>
    </div>
    <div class="bar" role="progressbar" aria-label="Loading the city" aria-valuemin="0" aria-valuemax="100"><i></i></div>
    <button class="btn primary play" type="button" disabled>Loading…</button>
    <button class="btn crewbtn" type="button">Choose crew <kbd>H</kbd></button>
    <button class="btn back" type="button">Arcade: Rush</button>
  </section>
  <section class="card safehouse" hidden aria-labelledby="safe-name">
    <p class="kicker">Safehouse · choose your crew</p>
    <h1 id="safe-name">Vex</h1>
    <div class="alias">The Spark</div>
    <div class="role">Leader</div>
    <p class="bio"></p>
    <div class="perk"><b></b><span></span></div>
    <div class="lock" aria-live="polite"></div>
    <div class="roster" role="group" aria-label="Crew"></div>
    <div class="row">
      <button class="btn primary pick" type="button">Play <kbd>Enter</kbd></button>
      <button class="btn close" type="button">Back <kbd>Esc</kbd></button>
    </div>
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
  public onOpenSafehouse: () => void = () => {};
  public onBrowse: (index: number) => void = () => {};
  public onPick: () => void = () => {};
  public onCloseSafehouse: () => void = () => {};
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
    this.q('.crewbtn').addEventListener('click', () => this.onOpenSafehouse());
    this.q('.pick').addEventListener('click', () => this.onPick());
    this.q('.close').addEventListener('click', () => this.onCloseSafehouse());
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

  public get safehouseOpen(): boolean {
    return !this.q('.card.safehouse').hidden;
  }

  public showSafehouse(on: boolean): void {
    this.q('.card.safehouse').hidden = !on;
    this.q('.card.intro').hidden = on ? true : this.q('.card.intro').hidden;
    this.root.classList.toggle('in-safehouse', on);
  }

  /** Fills the Safehouse with the roster, highlighting `index`. */
  public setSafehouse(entries: CrewEntry[], index: number): void {
    const e = entries[index];
    this.q('#safe-name').textContent = e.name;
    this.q('.safehouse .alias').textContent = e.alias;
    this.q('.safehouse .role').textContent = e.role;
    this.q('.safehouse .bio').textContent = e.bio;
    this.q('.safehouse .perk b').textContent = e.perkName;
    this.q('.safehouse .perk span').textContent = e.perkText;
    this.q('.safehouse .lock').textContent = e.unlocked ? (e.current ? 'Playing now' : '') : `Locked: ${e.lockText}`;
    const pick = this.q<HTMLButtonElement>('.pick');
    pick.disabled = !e.unlocked;
    pick.firstChild!.textContent = e.unlocked ? `Play as ${e.name.split(' ')[0]} ` : 'Locked ';
    this.q('.roster').replaceChildren(
      ...entries.map((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = c.name.split(' ')[0];
        b.setAttribute('aria-pressed', String(i === index));
        b.setAttribute('aria-label', `${c.name}, ${c.role}${c.unlocked ? '' : ', locked'}`);
        if (!c.unlocked) b.classList.add('locked');
        b.addEventListener('click', () => this.onBrowse(i));
        return b;
      })
    );
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

  private lastStars = -1;
  private lastAlarm = '';

  /** Liberated outposts out of all of them. */
  public setOutposts(freed: number, of: number): void {
    this.q('.freed').textContent = String(freed);
    this.q('.posts-of').textContent = String(of);
  }

  /** An outpost's alarm: counting down (amber), ringing (red), or nothing (hidden). */
  public setAlarm(text: string | null, ringing = false): void {
    const key = `${text}|${ringing}`;
    if (key === this.lastAlarm) return;
    this.lastAlarm = key;
    const el = this.q('.alarm');
    el.hidden = text === null;
    el.textContent = text ?? '';
    el.classList.toggle('ringing', ringing);
  }

  private lastAction = '';
  private lastPlace = '';

  /** Where the hero is: Downtown, or the Wilds. */
  public setPlace(name: string): void {
    if (name === this.lastPlace) return;
    this.lastPlace = name;
    this.q('.place b').textContent = name;
  }

  /** The context prompt: a takedown in reach, a ladder to climb, the glider to open (null: none). */
  public setAction(label: string | null, key = 'E'): void {
    const k = `${label}|${key}`;
    if (k === this.lastAction) return;
    this.lastAction = k;
    const el = this.q('.takedown');
    el.hidden = label === null;
    el.querySelector('span')!.textContent = label ?? '';
    el.querySelector('kbd')!.textContent = key;
  }

  /** HEAT, the wanted level: filled stars, flashing when it rises. */
  public setHeat(stars: number): void {
    if (stars === this.lastStars) return;
    const rising = stars > this.lastStars && this.lastStars >= 0;
    this.lastStars = stars;
    const heat = this.q('.heat');
    heat.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < stars));
    heat.setAttribute('aria-label', `Heat: ${stars} star${stars === 1 ? '' : 's'}`);
    heat.classList.remove('flash');
    if (rising) {
      void heat.offsetWidth;
      heat.classList.add('flash');
    }
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
