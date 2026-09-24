import { installRushTheme } from './RushTheme';

/**
 * The On Foot HUD (ADR-0012): score, coins and time top left, the three star coins top centre,
 * hearts top right, input devices bottom left, and one card at a time in the middle for the
 * title, the pause and the results. It wears the Rush glass theme (`RushTheme`), so the two modes
 * read as one game.
 */

export type ChipStatus = 'off' | 'loading' | 'on' | 'lost' | 'error';

export interface ResultStats {
  cleared: boolean;
  score: number;
  coins: number;
  starCoins: number;
  time: number;
  best: number;
}

const CSS = /* css */ `
body.rush #hud, body.rush #overlay-canvas { display: none !important; }
body.rush.playing #render-canvas { cursor: crosshair; }
#rush-hud.onfoot { position: absolute; inset: 0; pointer-events: none; user-select: none; }
#rush-hud.onfoot [hidden] { display: none !important; }
#rush-hud.onfoot .score-block { position: absolute; top: max(16px, env(safe-area-inset-top)); left: 20px; }
#rush-hud.onfoot .score { line-height: 1; }
#rush-hud.onfoot .sub { display: flex; gap: 16px; margin-top: 6px; font-size: 20px; }
#rush-hud.onfoot .sub span { display: inline-flex; align-items: center; gap: 6px; }
#rush-hud.onfoot .coin-icon { width: 0.85em; height: 0.85em; border-radius: 50%; }
#rush-hud.onfoot .stars { position: absolute; top: max(18px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
#rush-hud.onfoot .stars svg { width: 34px; height: 34px; }
#rush-hud.onfoot .stars svg.got { animation: onfoot-pop 0.4s cubic-bezier(.3,1.8,.5,1); }
#rush-hud.onfoot .hearts { position: absolute; top: max(18px, env(safe-area-inset-top)); right: 20px; display: flex; gap: 8px; }
#rush-hud.onfoot .hearts svg { width: 36px; transition: transform 0.25s cubic-bezier(.3,1.6,.5,1), opacity 0.2s; }
#rush-hud.onfoot .hearts svg.lost { transform: scale(0.7); opacity: 0.3; filter: grayscale(1); }
#rush-hud.onfoot .devices { position: absolute; left: 20px; bottom: max(20px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 8px; pointer-events: auto; }
#rush-hud.onfoot .chip { font-size: 15px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px 12px 6px 10px; border-radius: 999px; }
#rush-hud.onfoot .chip .dot { width: 10px; height: 10px; border-radius: 50%; background: #8a8fa0; }
#rush-hud.onfoot .chip[data-status="on"] .dot { background: #3ddc84; }
#rush-hud.onfoot .chip[data-status="loading"] .dot { background: #ffc23d; animation: onfoot-pulse 0.8s infinite; }
#rush-hud.onfoot .chip[data-status="lost"] .dot, #rush-hud.onfoot .chip[data-status="error"] .dot { background: #ff6b7a; }
#rush-hud.onfoot .card {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: auto; text-align: center;
  width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; padding: 26px 28px 24px;
  animation: onfoot-in 0.28s cubic-bezier(.2,.9,.3,1.1);
}
#rush-hud.onfoot .card .kicker { font-family: var(--t-body); font-style: normal; font-size: 13px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--t-muted); margin: 0 0 4px; }
#rush-hud.onfoot .card h1 { margin: 0; font-size: clamp(44px, 8vw, 72px); line-height: 0.9; text-transform: uppercase; }
#rush-hud.onfoot .card h1 span { color: var(--t-accent); }
#rush-hud.onfoot .card .lede { margin: 12px auto 16px; max-width: 42ch; font-size: 15px; line-height: 1.5; color: var(--t-text); opacity: 0.9; }
#rush-hud.onfoot .controls { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; text-align: left; }
#rush-hud.onfoot .control { padding: 8px 12px; }
#rush-hud.onfoot .control h3 { margin: 0 0 2px; }
#rush-hud.onfoot .control p { margin: 0; font-size: 12.5px; line-height: 1.45; }
#rush-hud.onfoot .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 18px; }
#rush-hud.onfoot .btn { font-size: 19px; padding: 10px 18px; cursor: pointer; }
#rush-hud.onfoot .btn kbd { margin-left: 8px; }
#rush-hud.onfoot .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0 4px; }
#rush-hud.onfoot .stat { padding: 8px 4px; }
#rush-hud.onfoot .stat b { display: block; font-size: 28px; }
#rush-hud.onfoot .stat small { font-size: 11px; }
#rush-hud.onfoot .bigstars { display: flex; justify-content: center; gap: 10px; margin: 10px 0 0; }
#rush-hud.onfoot .bigstars svg { width: 54px; height: 54px; }
#rush-hud.onfoot .record { min-height: 1.2em; margin-top: 8px; font-size: 20px; }
#rush-hud.onfoot .banner {
  position: absolute; left: 50%; top: 24%; transform: translateX(-50%); white-space: nowrap; opacity: 0; font-size: clamp(30px, 5vw, 52px);
  color: var(--t-gold); text-transform: uppercase; font-weight: 800;
}
#rush-hud.onfoot .banner.show { animation: onfoot-banner 1.8s ease-out forwards; }
#rush-hud.onfoot .popup { position: absolute; font-size: 24px; font-weight: 800; transform: translate(-50%, -50%); animation: onfoot-float 0.9s ease-out forwards; }
#rush-hud.onfoot .flash { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, transparent 40%, rgba(255,74,92,0.6)); }
#rush-hud.onfoot .flash.on { animation: onfoot-flash 0.45s ease-out; }
#rush-hud.onfoot .hint { position: absolute; left: 50%; bottom: max(22px, env(safe-area-inset-bottom)); transform: translateX(-50%); font-size: 18px; color: var(--t-text); }
@keyframes onfoot-in { from { opacity: 0; transform: translate(-50%, -46%) scale(0.96); } }
@keyframes onfoot-pop { 50% { transform: scale(1.4); } }
@keyframes onfoot-pulse { 50% { opacity: 0.3; } }
@keyframes onfoot-flash { from { opacity: 1; } to { opacity: 0; } }
@keyframes onfoot-float { 0% { opacity: 0; transform: translate(-50%, -30%); } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -160%); } }
@keyframes onfoot-banner {
  0% { opacity: 0; transform: translateX(-50%) scale(0.8); } 15% { opacity: 1; transform: translateX(-50%) scale(1.05); }
  25% { transform: translateX(-50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) translateY(-16px); }
}
@media (prefers-reduced-motion: reduce) {
  #rush-hud.onfoot *, #rush-hud.onfoot *::before, #rush-hud.onfoot *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
@media (max-width: 640px) {
  #rush-hud.onfoot .controls { grid-template-columns: 1fr; }
  #rush-hud.onfoot .stats { grid-template-columns: repeat(2, 1fr); }
}
`;

const STAR = (got: boolean) =>
  `<svg viewBox="0 0 24 24" class="star${got ? ' on' : ''}" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>`;
const HEART = `<svg viewBox="0 0 32 30" aria-hidden="true"><path d="M16 28 C 4 19, 1 13, 1 8.5 C 1 4, 4.5 1, 8.5 1 C 12 1, 14.5 3, 16 6 C 17.5 3, 20 1, 23.5 1 C 27.5 1, 31 4, 31 8.5 C 31 13, 28 19, 16 28 Z" fill="#ff4a6a" stroke="rgba(255,255,255,0.85)" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

const CONTROLS = `
  <div class="controls">
    <div class="control"><h3>Keys</h3><p>A / D or ← → walk · Space, W or ↑ jump (hold for higher) · J fire · R restart · P pause</p></div>
    <div class="control"><h3>Mouse</h3><p>Hold the left button to fire</p></div>
    <div class="control"><h3>Face · E</h3><p>Look left / right: walk · Raise brows: jump · Open mouth: fire</p></div>
    <div class="control"><h3>Hands · G</h3><p>Palm left / right: walk · Make a fist: jump · Pinch: fire</p></div>
  </div>`;

const MARKUP = `
  <div class="flash"></div>
  <div class="score-block">
    <div class="score toon" aria-label="Score">0</div>
    <div class="sub toon"><span><i class="coin-icon"></i><b class="coins">0</b></span><span class="time">0:00</span></div>
  </div>
  <div class="stars" role="img" aria-label="Star coins: 0 of 3">${STAR(false)}${STAR(false)}${STAR(false)}</div>
  <div class="hearts" role="img" aria-label="3 hearts left"></div>
  <div class="banner toon" role="status" aria-live="polite"></div>
  <div class="devices">
    <button class="chip gaze" data-status="off" type="button"><span class="dot"></span>Eyes <kbd>E</kbd></button>
    <button class="chip hand" data-status="off" type="button"><span class="dot"></span>Hands <kbd>G</kbd></button>
  </div>
  <section class="card intro" aria-labelledby="onfoot-title">
    <p class="kicker">World 1 · On Foot</p>
    <h1 id="onfoot-title">Windmill <span>Walk</span></h1>
    <p class="lede">The road ends at the river. Park up, climb out and go the rest of the way on foot: stomp the beetles, bump the blocks, and find all three star coins.</p>
    ${CONTROLS}
    <div class="actions">
      <button class="btn primary start" type="button">Start <kbd>Space</kbd></button>
      <button class="btn car" type="button">Back to the car <kbd>Esc</kbd></button>
    </div>
  </section>
  <section class="card pause" hidden aria-labelledby="onfoot-paused">
    <h1 id="onfoot-paused">Paused</h1>
    <div class="actions">
      <button class="btn primary resume" type="button">Resume <kbd>P</kbd></button>
      <button class="btn restart" type="button">Restart <kbd>R</kbd></button>
      <button class="btn car" type="button">Back to the car</button>
    </div>
  </section>
  <section class="card result" hidden aria-labelledby="onfoot-result">
    <p class="kicker result-kicker">Level clear</p>
    <h1 id="onfoot-result" class="result-title">Windmill <span>Walk</span></h1>
    <div class="bigstars"></div>
    <div class="stats"></div>
    <div class="record toon"></div>
    <div class="actions">
      <button class="btn primary again" type="button">Play again <kbd>R</kbd></button>
      <button class="btn car" type="button">Back to the car <kbd>Esc</kbd></button>
    </div>
  </section>
  <div class="hint toon" hidden></div>
`;

export class OnFootHUD {
  public onStart: () => void = () => {};
  public onResume: () => void = () => {};
  public onRestart: () => void = () => {};
  public onBackToCar: () => void = () => {};
  public onToggleGaze: () => void = () => {};
  public onToggleHand: () => void = () => {};

  private readonly root: HTMLElement;
  private readonly score: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly time: HTMLElement;
  private readonly stars: HTMLElement;
  private readonly hearts: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly title: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly result: HTMLElement;
  private readonly gazeChip: HTMLElement;
  private readonly handChip: HTMLElement;
  private readonly last = { score: -1, coins: -1, time: -1, stars: -1, hearts: -1, maxHearts: -1 };

  public constructor(container: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    document.body.classList.add('rush');
    installRushTheme();

    this.root = document.createElement('div');
    this.root.id = 'rush-hud';
    this.root.className = 'onfoot';
    this.root.innerHTML = MARKUP;
    container.appendChild(this.root);

    const q = <T extends HTMLElement>(s: string) => this.root.querySelector<T>(s)!;
    this.score = q('.score');
    this.coins = q('.coins');
    this.time = q('.time');
    this.stars = q('.stars');
    this.hearts = q('.hearts');
    this.banner = q('.banner');
    this.flash = q('.flash');
    this.title = q(".card.intro");
    this.pause = q('.card.pause');
    this.result = q('.card.result');
    this.gazeChip = q('.chip.gaze');
    this.handChip = q('.chip.hand');

    q('.start').addEventListener('click', () => this.onStart());
    q('.resume').addEventListener('click', () => this.onResume());
    q('.restart').addEventListener('click', () => this.onRestart());
    q('.again').addEventListener('click', () => this.onRestart());
    this.root.querySelectorAll('.car').forEach((b) => b.addEventListener('click', () => this.onBackToCar()));
    this.gazeChip.addEventListener('click', () => this.onToggleGaze());
    this.handChip.addEventListener('click', () => this.onToggleHand());
  }

  public showTitle(on: boolean): void {
    this.title.hidden = !on;
    if (on) this.root.querySelector<HTMLElement>('.start')?.focus({ preventScroll: true });
  }

  public showPause(on: boolean): void {
    this.pause.hidden = !on;
    if (on) this.root.querySelector<HTMLElement>('.resume')?.focus({ preventScroll: true });
  }

  public showResult(stats: ResultStats | null): void {
    this.result.hidden = stats === null;
    if (!stats) return;
    this.root.querySelector('.result-kicker')!.textContent = stats.cleared ? 'Level clear' : 'Out of hearts';
    const stars = [0, 1, 2].map((i) => STAR((stats.starCoins & (1 << i)) !== 0)).join('');
    this.root.querySelector('.bigstars')!.innerHTML = stars;
    const stat = (value: string, label: string) => `<div class="stat"><b>${value}</b><small>${label}</small></div>`;
    this.root.querySelector('.stats')!.innerHTML =
      stat(String(stats.score), 'Score') + stat(String(stats.coins), 'Coins') + stat(formatTime(stats.time), 'Time') + stat(String(stats.best), 'Best');
    this.root.querySelector('.record')!.textContent = stats.cleared && stats.score >= stats.best && stats.score > 0 ? 'New best!' : '';
    this.root.querySelector('.again')!.firstChild!.textContent = stats.cleared ? 'Play again ' : 'Try again ';
    this.root.querySelector<HTMLElement>('.again')?.focus({ preventScroll: true });
  }

  public update(score: number, coins: number, time: number, starCoins: number, hearts: number, maxHearts: number): void {
    const l = this.last;
    if (score !== l.score) this.score.textContent = String((l.score = score));
    if (coins !== l.coins) this.coins.textContent = String((l.coins = coins));
    const seconds = Math.floor(time);
    if (seconds !== l.time) this.time.textContent = formatTime((l.time = seconds));
    if (starCoins !== l.stars) {
      const svgs = this.stars.querySelectorAll('svg');
      svgs.forEach((svg, i) => {
        const got = (starCoins & (1 << i)) !== 0;
        const was = l.stars >= 0 && (l.stars & (1 << i)) !== 0;
        svg.classList.toggle('on', got);
        svg.classList.toggle('got', got && !was);
      });
      l.stars = starCoins;
      const count = [0, 1, 2].filter((i) => starCoins & (1 << i)).length;
      this.stars.setAttribute('aria-label', `Star coins: ${count} of 3`);
    }
    if (hearts !== l.hearts || maxHearts !== l.maxHearts) {
      if (maxHearts !== l.maxHearts) this.hearts.innerHTML = HEART.repeat(maxHearts);
      this.hearts.querySelectorAll('svg').forEach((svg, i) => svg.classList.toggle('lost', i >= hearts));
      this.hearts.setAttribute('aria-label', `${hearts} heart${hearts === 1 ? '' : 's'} left`);
      l.hearts = hearts;
      l.maxHearts = maxHearts;
    }
  }

  public setDevices(gaze: ChipStatus, hand: ChipStatus): void {
    this.gazeChip.dataset.status = gaze;
    this.handChip.dataset.status = hand;
  }

  public showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  public hurt(): void {
    this.flash.classList.remove('on');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
  }

  /** A floating number or word at a screen position, in CSS pixels. */
  public popup(text: string, x: number, y: number, color = '#ffc23d'): void {
    const el = document.createElement('div');
    el.className = 'popup toon';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    this.root.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    // Reduced motion shortens the animation; make sure the node still goes.
    setTimeout(() => el.remove(), 1500);
  }
}

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
