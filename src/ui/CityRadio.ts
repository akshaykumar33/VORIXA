/**
 * Cantor's radio on the HUD (ADR-0014, Far Cry layer): when he cuts into the hero's frequency, a
 * panel slides up above the prompts with his portrait (rendered in the Safehouse studio), a
 * crackling "on your frequency" tag, and his words typed out as he speaks them. Subtitles stay up
 * as long as the line runs (Radio.lineSeconds), then the panel slides away.
 *
 * With reduced motion the panel fades instead of sliding, and the line appears whole.
 */

const CSS = /* css */ `
#rush-hud.city .radio { position: absolute; left: 50%; bottom: max(196px, calc(env(safe-area-inset-bottom) + 196px)); width: min(600px, calc(100vw - 32px));
  transform: translate(-50%, 16px); opacity: 0; transition: opacity 0.22s ease-out, transform 0.22s ease-out; pointer-events: none;
  display: grid; grid-template-columns: 64px 1fr; gap: 14px; align-items: center; padding: 12px 16px 12px 12px; border-radius: 14px;
  background: linear-gradient(90deg, rgba(40,6,12,0.88), rgba(10,10,16,0.82)); border: 1px solid rgba(255,77,94,0.45); box-shadow: 0 10px 30px rgba(0,0,0,0.45); }
#rush-hud.city .radio.on { opacity: 1; transform: translate(-50%, 0); }
#rush-hud.city .radio .face { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; background: #2a0a10; border: 2px solid #ff4d5e; position: relative; }
#rush-hud.city .radio .face img { width: 100%; height: 100%; object-fit: cover; filter: saturate(0.7) contrast(1.1); }
#rush-hud.city .radio .face::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 2px, transparent 2px 4px); }
#rush-hud.city .radio small { display: flex; align-items: center; gap: 8px; font-family: var(--t-body); font-style: normal; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: #ff6b78; }
#rush-hud.city .radio small i { width: 7px; height: 7px; border-radius: 50%; background: #ff4d5e; box-shadow: 0 0 8px #ff4d5e; animation: city-radio 1s steps(2) infinite; }
@keyframes city-radio { 50% { opacity: 0.2; } }
#rush-hud.city .radio p { margin: 4px 0 0; font-family: var(--t-body); font-style: normal; font-size: 17px; line-height: 1.4; color: #f4efe9; min-height: 1.4em; }
@media (prefers-reduced-motion: reduce) {
  #rush-hud.city .radio { transition: opacity 0.2s; transform: translate(-50%, 0); }
  #rush-hud.city .radio small i { animation: none; }
}
@media (max-width: 700px) { #rush-hud.city .radio { grid-template-columns: 44px 1fr; } #rush-hud.city .radio .face { width: 44px; height: 44px; } #rush-hud.city .radio p { font-size: 15px; } }
`;

export class CityRadio {
  private readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private readonly img: HTMLImageElement;
  private line = '';
  private shown = 0;
  private left = 0;
  private readonly reduced: boolean;

  public constructor(container: HTMLElement) {
    if (!document.getElementById('city-radio-css')) {
      const style = document.createElement('style');
      style.id = 'city-radio-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.el = document.createElement('div');
    this.el.className = 'radio';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = '<div class="face"><img alt="" /></div><div><small><i></i>Cantor · on your frequency</small><p></p></div>';
    container.appendChild(this.el);
    this.text = this.el.querySelector('p')!;
    this.img = this.el.querySelector('img')!;
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Cantor's face, once the studio has rendered it. */
  public setPortrait(url: string | null): void {
    if (url) this.img.src = url;
  }

  /** Starts a line: shown for `seconds`, typed out over the first part of that. */
  public say(text: string, seconds: number): void {
    this.line = text;
    this.left = seconds;
    this.shown = this.reduced ? text.length : 0;
    this.text.textContent = this.reduced ? text : '';
    // Screen readers get the whole line at once, not letter by letter.
    this.el.setAttribute('aria-label', `Cantor: ${text}`);
    this.el.classList.add('on');
  }

  public update(dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.shown < this.line.length) {
      this.shown = Math.min(this.line.length, this.shown + dt * 38);
      this.text.textContent = this.line.slice(0, Math.floor(this.shown));
    }
    if (this.left <= 0) this.el.classList.remove('on');
  }
}
