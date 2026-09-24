import { installRushTheme } from './RushTheme';

/**
 * VORIXA City's HUD (ADR-0014), in the shared glass theme: the click-to-play card with the
 * controls, a loading bar, the crosshair, and the current view.
 */

const CSS = /* css */ `
body.rush #hud, body.rush #overlay-canvas { display: none !important; }
#rush-hud.city { position: absolute; inset: 0; pointer-events: none; user-select: none; }
#rush-hud.city [hidden] { display: none !important; }
#rush-hud.city .card {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: auto; text-align: center;
  width: min(600px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; padding: 26px 28px 24px;
}
#rush-hud.city .kicker { font-family: var(--t-body); font-style: normal; font-size: 13px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--t-muted); margin: 0 0 4px; }
#rush-hud.city h1 { margin: 0; font-size: clamp(44px, 8vw, 76px); line-height: 0.9; text-transform: uppercase; }
#rush-hud.city h1 span { color: var(--t-accent); }
#rush-hud.city .lede { margin: 12px auto 16px; max-width: 46ch; font-size: 15px; line-height: 1.5; opacity: 0.9; }
#rush-hud.city .keys { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 16px; text-align: left; margin: 0 auto; max-width: 440px; }
#rush-hud.city .keys div { display: flex; justify-content: space-between; gap: 12px; font-family: var(--t-body); font-style: normal; font-size: 14px; }
#rush-hud.city .keys span { color: var(--t-muted); }
#rush-hud.city .btn { font-size: 20px; padding: 11px 22px; margin-top: 18px; cursor: pointer; }
#rush-hud.city .bar { height: 6px; border-radius: 3px; margin: 18px auto 0; max-width: 320px; background: var(--t-faint); overflow: hidden; }
#rush-hud.city .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, var(--t-accent), var(--t-gold)); transition: width 0.2s ease-out; }
#rush-hud.city .crosshair { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; opacity: 0; transition: opacity 0.15s; }
#rush-hud.city .crosshair.on { opacity: 1; }
#rush-hud.city .crosshair::before, #rush-hud.city .crosshair::after { content: ''; position: absolute; background: rgba(255,255,255,0.92); box-shadow: 0 0 2px rgba(0,0,0,0.6); }
#rush-hud.city .crosshair::before { left: 10px; top: 0; width: 2px; height: 22px; }
#rush-hud.city .crosshair::after { top: 10px; left: 0; height: 2px; width: 22px; }
#rush-hud.city .corner { position: absolute; right: 20px; bottom: max(20px, env(safe-area-inset-bottom)); display: flex; gap: 8px; }
#rush-hud.city .chip { font-size: 15px; padding: 6px 12px; border-radius: 999px; }
#rush-hud.city .place { position: absolute; left: 20px; top: max(16px, env(safe-area-inset-top)); }
#rush-hud.city .place b { display: block; font-size: 30px; text-transform: uppercase; }
#rush-hud.city .place small { font-family: var(--t-body); font-style: normal; font-size: 13px; color: var(--t-muted); letter-spacing: 0.14em; text-transform: uppercase; }
@media (max-width: 640px) { #rush-hud.city .keys { grid-template-columns: 1fr; } }
`;

const MARKUP = `
  <div class="place toon"><small>VORIXA City</small><b>Downtown</b></div>
  <div class="crosshair" aria-hidden="true"></div>
  <div class="corner"><span class="chip view">Third person <kbd>V</kbd></span></div>
  <section class="card intro" aria-labelledby="city-title">
    <p class="kicker">Chapter 1 · Preview</p>
    <h1 id="city-title">VORIXA <span>City</span></h1>
    <p class="lede">A first look at the city: walk the downtown district, sprint, jump and switch to first person. Cars, guns, police and missions come next.</p>
    <div class="keys">
      <div>Move <span>W A S D</span></div>
      <div>Look <span>Mouse</span></div>
      <div>Sprint <span>Shift</span></div>
      <div>Jump <span>Space</span></div>
      <div>Aim <span>Right mouse</span></div>
      <div>First / third person <span>V</span></div>
      <div>Release the mouse <span>Esc</span></div>
      <div>Back to Rush <span>Menu button</span></div>
    </div>
    <div class="bar" role="progressbar" aria-label="Loading the city" aria-valuemin="0" aria-valuemax="100"><i></i></div>
    <button class="btn primary play" type="button" disabled>Loading…</button>
    <button class="btn back" type="button">Back to Rush</button>
  </section>
`;

export class CityHUD {
  public onPlay: () => void = () => {};
  public onBack: () => void = () => {};
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;
  private readonly play: HTMLButtonElement;
  private readonly bar: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly viewChip: HTMLElement;

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
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector<T>(s)!;
    this.card = q('.card.intro');
    this.play = q<HTMLButtonElement>('.play');
    this.bar = q('.bar');
    this.crosshair = q('.crosshair');
    this.viewChip = q('.view');
    this.play.addEventListener('click', () => this.onPlay());
    q('.back').addEventListener('click', () => this.onBack());
  }

  public progress(share: number): void {
    const pct = Math.round(share * 100);
    (this.bar.firstElementChild as HTMLElement).style.width = `${pct}%`;
    this.bar.setAttribute('aria-valuenow', String(pct));
  }

  public loaded(): void {
    this.bar.hidden = true;
    this.play.disabled = false;
    this.play.textContent = 'Click to play';
    this.play.focus({ preventScroll: true });
  }

  public failed(message: string): void {
    this.play.textContent = message;
  }

  /** The card shows whenever the mouse is not captured: before play, and after Esc. */
  public showCard(on: boolean, resumed = false): void {
    this.card.hidden = !on;
    if (on && resumed) this.play.textContent = 'Click to continue';
  }

  public setView(first: boolean, crosshair: boolean): void {
    this.viewChip.firstChild!.textContent = first ? 'First person ' : 'Third person ';
    this.crosshair.classList.toggle('on', crosshair);
  }
}
