import { TOUR, goalText, starsFor, totalStars, worldUnlocked, stageUnlocked, bitCount, type TourProgress, type StageDef } from '../rush/Tour';
import type { BiomeId } from '../rush/Zones';

/**
 * The World Tour's screens: the main menu, the world map, the in-stage HUD and the stage-clear
 * card. DOM over the canvas, like the rest of the HUD, and mounted inside it.
 *
 * The map works like a Mario overworld: one world at a time, its stages as stops along a path,
 * locked stops greyed out with the reason shown, a boss at the end, and a secret stop that stays
 * a question mark until its warp is found.
 */

const SKY: Record<BiomeId, [string, string]> = {
  meadow: ['#3fa7ff', '#ffe2b8'],
  desert: ['#ff8a5c', '#ffd79a'],
  snow: ['#6fb2ff', '#e6f3ff'],
  candy: ['#ff8fd0', '#ffe3f3'],
  neon: ['#120c38', '#6a3aa8'],
  beach: ['#2fc6ff', '#fff2c9']
};

const STAR = (filled: boolean) =>
  `<svg viewBox="0 0 24 24" class="star ${filled ? 'on' : ''}" aria-hidden="true"><path d="M12 2 L14.9 8.6 L22 9.3 L16.6 14 L18.2 21 L12 17.3 L5.8 21 L7.4 14 L2 9.3 L9.1 8.6 Z"/></svg>`;
const LOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="#1d1b33"/><path d="M8 11 V8 A4 4 0 0 1 16 8 V11" stroke="#1d1b33" stroke-width="2.6" fill="none"/></svg>`;
const CROWN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 L5 7 L10 12 L12 5 L14 12 L19 7 L21 18 Z" fill="#ffd23f" stroke="#1d1b33" stroke-width="2" stroke-linejoin="round"/></svg>`;

const CSS = /* css */ `
#rush-hud .menu { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; pointer-events: auto; align-items: center; }
#rush-hud .menu .btn { min-width: 250px; font-size: 22px; padding: 10px 18px; }
#rush-hud.tour .title .cta, #rush-hud.tour .school-link { display: none; }

#rush-hud .stagebar {
  position: absolute; left: 50%; top: calc(max(16px, env(safe-area-inset-top)) + 72px); transform: translateX(-50%);
  width: min(420px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: 6px; align-items: center;
}
#rush-hud .stagebar .name { font-size: 16px; }
#rush-hud .stagebar .track {
  position: relative; width: 100%; height: 12px; border-radius: 8px; background: rgba(29,27,51,0.5);
  box-shadow: 0 0 0 3px var(--ink);
}
#rush-hud .stagebar .track i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 8px; background: linear-gradient(90deg, #5ad16b, #ffd23f); }
#rush-hud .stagebar .track b {
  position: absolute; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%;
  background: #ff5a36; box-shadow: 0 0 0 3px var(--ink);
}
#rush-hud .stagebar .track .flag { position: absolute; right: -6px; top: -14px; font-size: 18px; }
#rush-hud .stagebar .row { display: flex; gap: 8px; align-items: center; }
#rush-hud .goal {
  font-size: 14px; padding: 3px 10px; border-radius: 999px; background: var(--cream); color: var(--ink);
  box-shadow: 0 0 0 3px var(--ink);
}
#rush-hud .goal.ok { background: #3ddc84; }
#rush-hud .goal.bad { background: #ffb3b3; }
#rush-hud .pips { display: flex; gap: 4px; }
#rush-hud .pips .star { width: 24px; height: 24px; }
#rush-hud .star path { fill: rgba(29,27,51,0.35); stroke: #1d1b33; stroke-width: 1.6; stroke-linejoin: round; }
#rush-hud .star.on path { fill: #ffd23f; }
#rush-hud .bossbar { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 4px; }
#rush-hud .bossbar .hp { width: 100%; height: 16px; border-radius: 9px; background: rgba(29,27,51,0.55); box-shadow: 0 0 0 3px var(--ink); overflow: hidden; }
#rush-hud .bossbar .hp i { display: block; height: 100%; background: linear-gradient(90deg, #ff4d5e, #ff9f1c); transition: width 0.15s; }
#rush-hud .bossbar .label { font-size: 18px; color: #ff4d5e; }

#rush-hud .map {
  position: absolute; inset: 0; pointer-events: auto; display: flex; flex-direction: column; align-items: center;
  padding: max(14px, env(safe-area-inset-top)) 16px 14px; gap: 10px; overflow-y: auto;
}
#rush-hud .map .head { text-align: center; }
#rush-hud .map h2 { margin: 0; font-weight: 400; font-size: clamp(30px, 5vw, 48px); }
#rush-hud .map .motto { font-size: clamp(16px, 2.2vw, 20px); color: var(--cream); }
#rush-hud .map .total { font-size: 18px; color: var(--sun); }
#rush-hud .map .tabs { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
#rush-hud .map .tab { font-size: 13px; padding: 5px 10px; }
#rush-hud .map .tab[aria-current="true"] { background: var(--sun); }
#rush-hud .map .tab.locked { opacity: 0.55; }
#rush-hud .map .guardian {
  display: flex; gap: 10px; align-items: center; max-width: 620px; background: var(--cream); color: var(--ink);
  border-radius: 18px; padding: 8px 14px; box-shadow: 0 0 0 3px var(--ink), 0 5px 0 3px var(--ink);
}
#rush-hud .map .guardian .face {
  flex: none; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; font-size: 20px;
  background: var(--coral); color: #fff; box-shadow: 0 0 0 3px var(--ink);
}
#rush-hud .map .guardian p { margin: 0; font-family: system-ui, sans-serif; font-size: 13.5px; font-weight: 600; letter-spacing: 0; }
#rush-hud .map .guardian b { font-family: 'Lilita One', system-ui, sans-serif; font-weight: 400; font-size: 15px; }
#rush-hud .map .path { position: relative; width: min(720px, 100%); height: 150px; flex: none; }
#rush-hud .map .path svg.line { position: absolute; inset: 0; width: 100%; height: 100%; }
#rush-hud .map .node {
  position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border-radius: 50%; border: none; cursor: pointer;
  font: inherit; font-size: 26px; color: var(--ink); background: var(--cream);
  box-shadow: 0 0 0 4px var(--ink), 0 6px 0 4px var(--ink); display: grid; place-items: center;
  transition: transform 0.15s cubic-bezier(.3,1.6,.5,1);
}
#rush-hud .map .node svg { width: 32px; height: 32px; }
#rush-hud .map .node.boss { background: #ff5a36; }
#rush-hud .map .node.secret { background: #9b6bff; color: #fff; }
#rush-hud .map .node.locked { background: #b8b3c9; cursor: not-allowed; }
#rush-hud .map .node.selected { transform: scale(1.2); }
#rush-hud .map .node:focus-visible { outline: 4px solid var(--sky); outline-offset: 6px; }
#rush-hud .map .node .mini { position: absolute; top: 66px; display: flex; gap: 1px; }
#rush-hud .map .node .mini .star { width: 16px; height: 16px; }
#rush-hud .map .info {
  width: min(560px, 100%); background: var(--cream); color: var(--ink); border-radius: 20px; padding: 12px 16px;
  box-shadow: 0 0 0 4px var(--ink), 0 7px 0 4px var(--ink); text-align: center;
}
#rush-hud .map .info h3 { margin: 0; font-weight: 400; font-size: 24px; }
#rush-hud .map .info .goalline { font-family: system-ui, sans-serif; font-weight: 700; font-size: 14px; margin: 4px 0; letter-spacing: 0; }
#rush-hud .map .info .secretline { font-family: system-ui, sans-serif; font-size: 13px; font-style: italic; margin: 4px 0; letter-spacing: 0; }
#rush-hud .map .info .actions { margin-top: 8px; }
#rush-hud .map .hints { font-family: system-ui, sans-serif; font-weight: 700; font-size: 12px; color: #fff; letter-spacing: 0;
  text-shadow: 0 1px 0 #1d1b33, 0 0 6px #1d1b33; }

#rush-hud .stagecard .stars3 { display: flex; justify-content: center; gap: 10px; margin: 8px 0; }
#rush-hud .stagecard .stars3 .star { width: 56px; height: 56px; }
#rush-hud .stagecard .stars3 .star.on { animation: rush-bump 0.4s cubic-bezier(.3,1.8,.5,1) both; }
#rush-hud .stagecard .stars3 .star.on:nth-child(2) { animation-delay: 0.15s; }
#rush-hud .stagecard .stars3 .star.on:nth-child(3) { animation-delay: 0.3s; }
#rush-hud .stagecard .checks { list-style: none; padding: 0; margin: 8px 0; font-family: system-ui, sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 0; text-align: left; display: inline-block; }
#rush-hud .stagecard .checks li { margin: 3px 0; }
#rush-hud .stagecard .checks .yes::before { content: '✔ '; color: #2a9d5c; }
#rush-hud .stagecard .checks .no::before { content: '✘ '; color: #c2262f; }
#rush-hud .stagecard .secretnews { color: #9b6bff; font-size: 20px; margin: 4px 0; }
@media (max-height: 640px) {
  #rush-hud .map { gap: 6px; }
  #rush-hud .map .path { height: 110px; }
  #rush-hud .map .hints { display: none; }
  #rush-hud .map .guardian p { font-size: 12px; }
}
/* The map replaces the title screen rather than sitting on top of it. */
#rush-hud.mapping .card.title, #rush-hud.mapping .devices, #rush-hud.mapping .hearts, #rush-hud.mapping .camera { display: none !important; }
`;

export interface StageHud {
  name: string;
  /** 0–1 along the stage, or null on a boss stage. */
  progress: number | null;
  goal: string;
  /** true met, false failed, null still in play. */
  goalState: boolean | null;
  starCoins: number;
  boss: { name: string; hp: number; max: number } | null;
}

export interface StageOutcome {
  stage: StageDef;
  cleared: boolean;
  goalMet: boolean;
  starCoinsThisRun: number;
  starCoinsBest: number;
  starsNow: number;
  newStars: number;
  newSecret: boolean;
  score: number;
  hasNext: boolean;
}

export class TourUI {
  private readonly host: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly stagebar: HTMLElement;
  private readonly map: HTMLElement;
  private readonly card: HTMLElement;
  private lastHudKey = '';

  public onMenu: (choice: 'tour' | 'endless' | 'school' | 'garage') => void = () => {};
  public onPlay: (stageId: string) => void = () => {};
  public onSelect: (world: number, stage: number) => void = () => {};
  public onMapBack: () => void = () => {};
  public onNext: () => void = () => {};
  public onRetry: () => void = () => {};
  public onToMap: () => void = () => {};

  public constructor(hudRoot: HTMLElement) {
    this.host = hudRoot;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    hudRoot.classList.add('tour');

    this.menu = document.createElement('div');
    this.menu.className = 'menu';
    this.menu.setAttribute('role', 'group');
    this.menu.setAttribute('aria-label', 'Game modes');
    this.menu.innerHTML = `
      <button class="btn primary m-tour" type="button">World Tour<kbd>Enter</kbd></button>
      <button class="btn m-endless" type="button">Endless Rush<kbd>Space</kbd></button>
      <button class="btn m-school" type="button">Driving School<kbd>T</kbd></button>
      <button class="btn m-garage" type="button">Garage &amp; Upgrades<kbd>U</kbd></button>`;
    hudRoot.querySelector('.card.title .head')?.appendChild(this.menu);
    this.wire(this.menu.querySelector('.m-tour'), () => this.onMenu('tour'));
    this.wire(this.menu.querySelector('.m-endless'), () => this.onMenu('endless'));
    this.wire(this.menu.querySelector('.m-school'), () => this.onMenu('school'));
    this.wire(this.menu.querySelector('.m-garage'), () => this.onMenu('garage'));

    this.stagebar = document.createElement('div');
    this.stagebar.className = 'stagebar';
    this.stagebar.hidden = true;
    hudRoot.appendChild(this.stagebar);

    this.map = document.createElement('section');
    this.map.className = 'map';
    this.map.hidden = true;
    this.map.setAttribute('aria-label', 'World map');
    hudRoot.appendChild(this.map);

    this.card = document.createElement('section');
    this.card.className = 'card stagecard';
    this.card.hidden = true;
    this.card.setAttribute('aria-live', 'polite');
    hudRoot.appendChild(this.card);
  }

  /** Buttons press the button, never the game: same rule as the rest of the HUD. */
  private wire(el: Element | null, action: () => void): void {
    if (!(el instanceof HTMLElement)) return;
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    el.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') e.stopPropagation();
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.detail > 0) el.blur();
      action();
    });
  }

  // ─── Map ──────────────────────────────────────────────────────────────────────────────────

  public get mapOpen(): boolean {
    return !this.map.hidden;
  }

  public hideMap(): void {
    this.map.hidden = true;
    this.host.classList.remove('mapping');
  }

  /** Draws the map for one world with one stop selected. */
  public showMap(progress: TourProgress, worldIndex: number, selected: number): void {
    const world = TOUR[worldIndex];
    const open = worldUnlocked(progress, worldIndex);
    const stops = world.stages;
    const [top, bottom] = SKY[world.biome];
    this.map.style.background = `linear-gradient(180deg, ${top}ee, ${bottom}dd)`;
    const total = totalStars(progress);

    const tabs = TOUR.map((w, i) => {
      const locked = !worldUnlocked(progress, i);
      return `<button class="chip tab ${locked ? 'locked' : ''}" data-world="${i}" aria-current="${i === worldIndex}" type="button">${i + 1}. ${w.name}${locked ? ` · ★${w.starsToUnlock}` : ''}</button>`;
    }).join('');

    // Stops along a gentle wave; the secret sits off the path until found.
    const regular = stops.filter((s) => !s.secret);
    const secret = stops.find((s) => s.secret)!;
    const positions = regular.map((_, i) => ({ x: 10 + (i / (regular.length - 1)) * 80, y: 55 + Math.sin(i * 1.4) * 22 }));
    const line = positions.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const nodes = [...regular, secret].map((stage, i) => {
      const unlocked = stageUnlocked(progress, stage);
      const isSecret = stage.secret;
      const found = isSecret && progress.secrets.includes(stage.id);
      const pos = isSecret ? { x: 50, y: 12 } : positions[i];
      const stars = starsFor(progress.stages[stage.id]);
      const label = isSecret ? (found ? '★' : '?') : stage.boss ? CROWN : String(i + 1);
      const icon = unlocked ? label : LOCK;
      const mini = unlocked && !(isSecret && !found)
        ? `<span class="mini">${[0, 1, 2].map((k) => STAR(k < stars)).join('')}</span>`
        : '';
      const name = isSecret && !found ? 'A secret stage (not yet found)' : `${stage.name}${unlocked ? '' : ' (locked)'}`;
      return `<button type="button" class="node ${stage.boss ? 'boss' : ''} ${isSecret ? 'secret' : ''} ${unlocked ? '' : 'locked'} ${i === selected ? 'selected' : ''}"
        style="left:${pos.x}%;top:${pos.y}%" data-stage="${i}" aria-label="${name}">${icon}${mini}</button>`;
    }).join('');

    const stage = [...regular, secret][selected];
    const unlocked = stageUnlocked(progress, stage);
    const record = progress.stages[stage.id];
    const coins = record?.starCoins ?? 0;
    let secretLine = '';
    if (stage.hasSecret) {
      secretLine = progress.secrets.includes(world.stages.find((s) => s.secret)!.id)
        ? 'Secret warp found here!'
        : 'Legend says something golden floats above this road…';
    }
    const hiddenSecret = stage.secret && !progress.secrets.includes(stage.id);
    const why = !open
      ? `Needs ${world.starsToUnlock} stars and the last boss beaten`
      : hiddenSecret
        ? 'Find the golden crate in this world to open it'
        : stage.boss
          ? 'Clear every stage in this world first'
          : 'Clear the previous stage first';

    this.map.innerHTML = `
      <div class="head">
        <h2 class="toon">WORLD ${worldIndex + 1} · ${world.name.toUpperCase()}</h2>
        <div class="motto toon">“${world.motto}”</div>
        <div class="total toon">★ ${total} stars</div>
      </div>
      <nav class="tabs" aria-label="Worlds">${tabs}</nav>
      <div class="guardian"><div class="face" aria-hidden="true">${world.guardian[0]}</div><p><b>${world.guardian}:</b> ${world.intro}</p></div>
      <div class="path"><svg class="line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="${line}" stroke="#1d1b33" stroke-width="5" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
        <path d="${line}" stroke="#fff7e0" stroke-width="2.5" stroke-dasharray="6 6" fill="none" vector-effect="non-scaling-stroke"/>
      </svg>${nodes}</div>
      <div class="info" aria-live="polite">
        <h3>${hiddenSecret ? '???' : stage.name}</h3>
        <div class="goalline">${hiddenSecret ? 'A hidden stage' : stage.boss ? 'Defeat the boss' : goalText(stage.goal)}</div>
        ${hiddenSecret ? '' : `<div class="pips" style="justify-content:center" aria-label="${bitCount(coins)} of 3 star coins">${[0, 1, 2].map((k) => STAR(((coins >> k) & 1) === 1)).join('')}</div>`}
        ${secretLine ? `<div class="secretline">${secretLine}</div>` : ''}
        ${record?.bestScore ? `<div class="goalline">Best: ${record.bestScore.toLocaleString()}</div>` : ''}
        <div class="actions">
          ${unlocked ? `<button class="btn primary play" type="button">Play<kbd>Space</kbd></button>` : `<div class="goalline">${why}</div>`}
          <button class="btn back" type="button">Back<kbd>Esc</kbd></button>
        </div>
      </div>
      <div class="hints">← → choose a stop · ↑ ↓ change world · Space play · Esc back</div>`;
    this.map.hidden = false;
    this.host.classList.add('mapping');

    this.map.querySelectorAll<HTMLElement>('.tab').forEach((tab) =>
      this.wire(tab, () => this.onSelect(Number(tab.dataset.world), 0))
    );
    this.map.querySelectorAll<HTMLElement>('.node').forEach((node) =>
      this.wire(node, () => this.onSelect(worldIndex, Number(node.dataset.stage)))
    );
    this.wire(this.map.querySelector('.play'), () => this.onPlay(stage.id));
    this.wire(this.map.querySelector('.back'), () => this.onMapBack());
  }

  // ─── Menu ─────────────────────────────────────────────────────────────────────────────────

  public focusMenu(): void {
    this.menu.querySelector<HTMLElement>('.m-tour')?.focus({ preventScroll: true });
  }

  // ─── In-stage HUD ─────────────────────────────────────────────────────────────────────────

  public setStageHud(hud: StageHud | null): void {
    if (!hud) {
      this.stagebar.hidden = true;
      this.lastHudKey = '';
      return;
    }
    this.stagebar.hidden = false;
    // Rebuild only when something visible changed; the bar position updates every frame.
    const key = `${hud.name}|${hud.goal}|${hud.goalState}|${hud.starCoins}|${hud.boss ? 'b' : 'p'}`;
    if (key !== this.lastHudKey) {
      this.lastHudKey = key;
      const pips = `<div class="pips" aria-label="${bitCount(hud.starCoins)} of 3 star coins">${[0, 1, 2].map((k) => STAR(((hud.starCoins >> k) & 1) === 1)).join('')}</div>`;
      const goalClass = hud.goalState === true ? 'ok' : hud.goalState === false ? 'bad' : '';
      this.stagebar.innerHTML = hud.boss
        ? `<div class="bossbar"><div class="label toon">${hud.boss.name}</div><div class="hp"><i></i></div></div><div class="row">${pips}</div>`
        : `<div class="name toon">${hud.name}</div><div class="track"><i></i><b></b><span class="flag" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20"><rect x="2" y="2" width="2" height="17" fill="#1d1b33"/><rect x="4" y="2" width="14" height="10" fill="#fff7e0" stroke="#1d1b33" stroke-width="1.5"/><rect x="4" y="2" width="3.5" height="5" fill="#1d1b33"/><rect x="11" y="2" width="3.5" height="5" fill="#1d1b33"/><rect x="7.5" y="7" width="3.5" height="5" fill="#1d1b33"/><rect x="14.5" y="7" width="3.5" height="5" fill="#1d1b33"/></svg></span></div>
           <div class="row"><span class="goal ${goalClass}">${hud.goal}</span>${pips}</div>`;
    }
    if (hud.boss) {
      const fill = this.stagebar.querySelector<HTMLElement>('.hp i');
      if (fill) fill.style.width = `${Math.max(0, (hud.boss.hp / hud.boss.max) * 100)}%`;
    } else if (hud.progress !== null) {
      const pct = `${Math.min(100, hud.progress * 100)}%`;
      const fill = this.stagebar.querySelector<HTMLElement>('.track i');
      const car = this.stagebar.querySelector<HTMLElement>('.track b');
      if (fill) fill.style.width = pct;
      if (car) car.style.left = pct;
    }
  }

  // ─── Stage clear / fail ───────────────────────────────────────────────────────────────────

  public hideResult(): void {
    this.card.hidden = true;
  }

  public showResult(o: StageOutcome): void {
    const record = { finish: o.cleared, goal: o.cleared && o.goalMet, coins: bitCount(o.starCoinsBest) === 3 };
    const stars = [o.starsNow >= 1, o.starsNow >= 2, o.starsNow >= 3];
    this.card.innerHTML = `
      <h2 class="logo toon" style="font-size:clamp(36px,6vw,56px)">${o.cleared ? (o.stage.boss ? 'BOSS DOWN!' : 'STAGE CLEAR!') : 'OUT OF HEARTS'}</h2>
      <div class="goalline" style="font-family:system-ui,sans-serif;font-weight:700">${o.stage.name}</div>
      <div class="stars3" aria-label="${o.starsNow} of 3 stars">${stars.map((s) => STAR(s)).join('')}</div>
      ${o.newStars > 0 ? `<div class="record toon">+${o.newStars} NEW STAR${o.newStars > 1 ? 'S' : ''}!</div>` : ''}
      <ul class="checks">
        <li class="${record.finish ? 'yes' : 'no'}">${o.stage.boss ? 'Defeat the boss' : 'Reach the finish flag'}</li>
        <li class="${o.cleared && o.goalMet ? 'yes' : 'no'}">${goalText(o.stage.goal)}</li>
        <li class="${record.coins ? 'yes' : 'no'}">All 3 star coins (${bitCount(o.starCoinsBest)}/3 found${o.starCoinsThisRun ? `, ${bitCount(o.starCoinsThisRun)} this run` : ''})</li>
      </ul>
      ${o.newSecret ? '<div class="secretnews toon">SECRET WARP FOUND! A hidden stage has opened on the map.</div>' : ''}
      <div class="goalline" style="font-family:system-ui,sans-serif;font-weight:700">Score ${o.score.toLocaleString()}</div>
      <div class="actions">
        ${o.cleared && o.hasNext ? '<button class="btn primary next" type="button">Next stage<kbd>Space</kbd></button>' : ''}
        <button class="btn ${o.cleared && o.hasNext ? '' : 'primary'} retry" type="button">${o.cleared ? 'Replay' : 'Try again'}<kbd>R</kbd></button>
        <button class="btn tomap" type="button">World map<kbd>Esc</kbd></button>
      </div>`;
    this.card.hidden = false;
    this.wire(this.card.querySelector('.next'), () => this.onNext());
    this.wire(this.card.querySelector('.retry'), () => this.onRetry());
    this.wire(this.card.querySelector('.tomap'), () => this.onToMap());
    (this.card.querySelector<HTMLElement>('.next') ?? this.card.querySelector<HTMLElement>('.retry'))?.focus({ preventScroll: true });
  }

  public get resultOpen(): boolean {
    return !this.card.hidden;
  }

  public setMenuVisible(visible: boolean): void {
    this.menu.hidden = !visible;
    this.host.classList.toggle('tour', true);
  }
}
