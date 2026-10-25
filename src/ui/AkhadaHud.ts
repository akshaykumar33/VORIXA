import { MAX_HP, ROUNDS_TO_WIN, type Fight } from '../fighter/Fight';
import type { Contender } from '../fighter/Roster';
import type { StageDef } from '../rendering/fighter/Stages';

/**
 * Akhada's HUD and menus (ADR-0016), in the DOM over the canvas: health bars with a trailing red
 * chunk that drains after the hit, names and round pips, the timer, super meters, combo counters,
 * the announcer, and the fighter select, pause and results screens.
 */

const CSS = `
.ak { position:absolute; inset:0; pointer-events:none; font-family:'Barlow Condensed','Space Grotesk Variable',system-ui,sans-serif; color:#fff; user-select:none; }
.ak-top { position:absolute; top:18px; left:24px; right:24px; display:grid; grid-template-columns:1fr auto 1fr; gap:18px; align-items:start; }
.ak-side { display:flex; flex-direction:column; gap:6px; }
.ak-side.r { align-items:flex-end; }
.ak-bar { position:relative; width:100%; height:22px; background:rgba(10,6,4,.7); border:2px solid rgba(255,220,170,.85); transform:skewX(-18deg); overflow:hidden; box-shadow:0 0 18px rgba(0,0,0,.6); }
.ak-side.r .ak-bar { transform:skewX(18deg); }
.ak-bar i { position:absolute; top:0; bottom:0; transition:width .08s linear; }
.ak-bar .lag { background:#d8261c; transition:width .6s ease-out .35s; }
.ak-bar .hp { background:linear-gradient(#ffe27a,#f2a51f 55%,#c96c0e); }
.ak-side.l .ak-bar i { left:0; } .ak-side.r .ak-bar i { right:0; }
.ak-bar.low .hp { background:linear-gradient(#ff8a7a,#e8331f 55%,#9e1610); }
.ak-name { font-size:26px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; text-shadow:0 2px 8px #000; display:flex; gap:10px; align-items:baseline; }
.ak-name small { font-size:14px; opacity:.75; letter-spacing:.12em; }
.ak-pips { display:flex; gap:6px; }
.ak-pips b { width:14px; height:14px; border-radius:50%; border:2px solid #ffd27a; background:transparent; }
.ak-pips b.on { background:#ffb21f; box-shadow:0 0 10px #ffb21f; }
.ak-clock { min-width:84px; text-align:center; font-size:56px; font-weight:800; line-height:1; text-shadow:0 0 14px rgba(255,170,60,.7),0 3px 6px #000; padding-top:2px; }
.ak-meter { position:absolute; bottom:22px; width:34%; height:12px; background:rgba(0,0,0,.55); border:2px solid rgba(255,255,255,.6); }
.ak-meter.l { left:24px; } .ak-meter.r { right:24px; }
.ak-meter i { position:absolute; top:0; bottom:0; transition:width .1s; }
.ak-meter.l i { left:0; } .ak-meter.r i { right:0; }
.ak-meter.full { animation:akpulse .5s infinite alternate; }
.ak-meter span { position:absolute; top:-22px; font-size:15px; font-weight:800; letter-spacing:.1em; }
.ak-meter.l span { left:0; } .ak-meter.r span { right:0; }
@keyframes akpulse { from { box-shadow:0 0 4px #fff; } to { box-shadow:0 0 22px #ffd27a; } }
.ak-combo { position:absolute; top:30%; font-size:54px; font-weight:900; font-style:italic; text-shadow:0 0 18px currentColor,0 3px 6px #000; opacity:0; transition:opacity .2s; }
.ak-combo.l { left:5%; } .ak-combo.r { right:5%; }
.ak-combo small { display:block; font-size:22px; letter-spacing:.2em; }
.ak-announce { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; opacity:0; transition:opacity .15s; }
.ak-announce.show { opacity:1; }
.ak-announce h1 { font-size:min(15vw,150px); font-weight:900; font-style:italic; margin:0; letter-spacing:.04em; background:linear-gradient(#fff6c8,#ffb21f 50%,#d2541a); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 6px 0 #4a1405) drop-shadow(0 0 30px rgba(255,140,30,.6)); animation:akslam .35s cubic-bezier(.2,1.6,.4,1); }
.ak-announce p { font-size:30px; font-weight:700; letter-spacing:.3em; margin:6px 0 0; text-shadow:0 2px 6px #000; }
@keyframes akslam { from { transform:scale(2.4); opacity:0; } to { transform:scale(1); opacity:1; } }
.ak-screen { position:absolute; inset:0; pointer-events:auto; display:flex; flex-direction:column; align-items:center; justify-content:center; background:radial-gradient(ellipse at center,rgba(40,14,4,.55),rgba(5,2,0,.88)); }
.ak-screen h2 { font-size:min(12vw,110px); font-weight:900; font-style:italic; margin:0; letter-spacing:.05em; background:linear-gradient(#fff6c8,#ffb21f 50%,#d2541a); -webkit-background-clip:text; background-clip:text; color:transparent; filter:drop-shadow(0 5px 0 #4a1405); }
.ak-screen .sub { font-size:20px; letter-spacing:.35em; margin-bottom:26px; opacity:.85; }
.ak-roster { display:flex; gap:16px; margin:10px 0 22px; }
.ak-card { width:170px; padding:14px 12px; border:2px solid rgba(255,210,150,.35); background:rgba(20,8,2,.6); text-align:center; transform:skewX(-6deg); transition:transform .15s,border-color .15s,box-shadow .15s; }
.ak-card.p1 { border-color:#ffb21f; box-shadow:0 0 22px rgba(255,178,31,.6); transform:skewX(-6deg) translateY(-6px); }
.ak-card .nm { font-size:clamp(15px, 1.5vw, 24px); font-weight:900; text-transform:uppercase; white-space:nowrap; }
.ak-card .tt { font-size:14px; opacity:.8; letter-spacing:.08em; min-height:34px; }
.ak-card .sw { height:6px; margin:8px auto 0; width:60%; }
.ak-opts { display:flex; gap:10px; margin-bottom:18px; }
.ak-opt { padding:8px 16px; border:2px solid rgba(255,255,255,.25); font-size:20px; font-weight:700; letter-spacing:.08em; }
.ak-opt.on { border-color:#ffb21f; background:rgba(255,178,31,.18); }
.ak-help { font-size:16px; opacity:.8; letter-spacing:.06em; line-height:1.7; text-align:center; max-width:880px; }
.ak-help kbd { display:inline-block; padding:0 6px; border:1px solid rgba(255,255,255,.5); border-radius:3px; font-family:inherit; }
.ak-arena { display:flex; align-items:center; gap:18px; margin-bottom:16px; font-size:20px; letter-spacing:.06em; }
.ak-arena > div { text-align:center; min-width:420px; padding:8px 16px; border:2px solid rgba(255,178,31,.6); background:rgba(40,16,4,.6); }
.ak-arena small { display:block; font-size:14px; opacity:.8; letter-spacing:.02em; font-family:'Space Grotesk Variable',system-ui,sans-serif; margin-top:4px; }
.ak-arena span { opacity:.7; font-weight:700; }
.ak-vs { display:flex; align-items:center; gap:40px; margin:12px 0 22px; }
.ak-vs > div { text-align:center; min-width:260px; }
.ak-vs b { display:block; font-size:clamp(34px,5vw,64px); font-weight:900; font-style:italic; text-transform:uppercase; text-shadow:0 0 24px currentColor,0 4px 0 #2a0a02; }
.ak-vs small { display:block; color:#f4e6cc; font-size:16px; letter-spacing:.14em; text-transform:uppercase; }
.ak-vs > span { font-size:72px; font-weight:900; font-style:italic; color:#ffb21f; text-shadow:0 0 30px #ff6a10; }
.ak-bio { max-width:640px; text-align:center; font-size:18px; opacity:.9; min-height:48px; margin-bottom:14px; font-family:'Space Grotesk Variable',system-ui,sans-serif; }
.ak-loading { position:absolute; bottom:40px; left:50%; transform:translateX(-50%); width:320px; height:4px; background:rgba(255,255,255,.15); }
.ak-loading i { display:block; height:100%; background:#ffb21f; width:0; transition:width .2s; }
`;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export class AkhadaHud {
  private readonly el: HTMLElement;
  private readonly hp: HTMLElement[] = [];
  private readonly lag: HTMLElement[] = [];
  private readonly bars: HTMLElement[] = [];
  private readonly names: HTMLElement[] = [];
  private readonly pips: HTMLElement[] = [];
  private readonly meters: HTMLElement[] = [];
  private readonly meterFill: HTMLElement[] = [];
  private readonly combos: HTMLElement[] = [];
  private readonly clock: HTMLElement;
  private readonly announce: HTMLElement;
  private readonly screen: HTMLElement;
  private comboHold = [0, 0];
  private announceUntil = 0;

  public constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'ak';
    this.el.innerHTML = `
      <div class="ak-top">
        <div class="ak-side l"><div class="ak-name"></div><div class="ak-bar"><i class="lag"></i><i class="hp"></i></div><div class="ak-pips"></div></div>
        <div class="ak-clock">99</div>
        <div class="ak-side r"><div class="ak-name"></div><div class="ak-bar"><i class="lag"></i><i class="hp"></i></div><div class="ak-pips"></div></div>
      </div>
      <div class="ak-meter l"><span>SUPER</span><i></i></div><div class="ak-meter r"><span>SUPER</span><i></i></div>
      <div class="ak-combo l"></div><div class="ak-combo r"></div>
      <div class="ak-announce"><h1></h1><p></p></div>
      <div class="ak-screen"></div>`;
    parent.appendChild(this.el);
    this.el.querySelectorAll<HTMLElement>('.ak-side').forEach((side) => {
      this.names.push(side.querySelector('.ak-name')!);
      this.bars.push(side.querySelector('.ak-bar')!);
      this.hp.push(side.querySelector('.hp')!);
      this.lag.push(side.querySelector('.lag')!);
      this.pips.push(side.querySelector('.ak-pips')!);
    });
    this.el.querySelectorAll<HTMLElement>('.ak-meter').forEach((m) => {
      this.meters.push(m);
      this.meterFill.push(m.querySelector('i')!);
    });
    this.el.querySelectorAll<HTMLElement>('.ak-combo').forEach((c) => this.combos.push(c));
    this.clock = this.el.querySelector('.ak-clock')!;
    this.announce = this.el.querySelector('.ak-announce')!;
    this.screen = this.el.querySelector('.ak-screen')!;
  }

  public setFighters(a: Contender, b: Contender): void {
    [a, b].forEach((c, i) => {
      this.names[i].innerHTML = i === 0 ? `${c.name}<small>${c.title}</small>` : `<small>${c.title}</small>${c.name}`;
      this.names[i].style.color = '#fff';
      this.meterFill[i].style.background = `linear-gradient(90deg, ${hex(c.colour)}, #fff)`;
      this.combos[i].style.color = hex(c.colour);
    });
  }

  public update(fight: Fight, dt: number): void {
    fight.fighters.forEach((f, i) => {
      const share = `${(Math.max(0, f.hp) / MAX_HP) * 100}%`;
      this.hp[i].style.width = share;
      this.lag[i].style.width = share;
      this.bars[i].classList.toggle('low', f.hp < MAX_HP * 0.25);
      this.meterFill[i].style.width = `${f.meter}%`;
      this.meters[i].classList.toggle('full', f.meter >= 100);
      const pips = Array.from({ length: ROUNDS_TO_WIN }, (_, k) => `<b class="${k < f.wins ? 'on' : ''}"></b>`).join('');
      if (this.pips[i].innerHTML !== pips) this.pips[i].innerHTML = pips;
      // The combo counter belongs to the attacker: it shows the hits the other one has taken.
      const taken = fight.fighters[1 - i].comboTaken;
      if (taken >= 2) {
        this.combos[i].innerHTML = `${taken} HITS<small>COMBO</small>`;
        this.comboHold[i] = 1.2;
      }
      this.comboHold[i] = Math.max(0, this.comboHold[i] - dt);
      this.combos[i].style.opacity = this.comboHold[i] > 0 ? '1' : '0';
    });
    this.clock.textContent = String(Math.ceil(fight.clock));
    if (this.announceUntil && performance.now() > this.announceUntil) {
      this.announce.classList.remove('show');
      this.announceUntil = 0;
    }
  }

  /** The big call: ROUND 1, FIGHT!, K.O. With a line under it (here, Hindi). */
  public call(text: string, sub = '', seconds = 1.4): void {
    const h = this.announce.querySelector('h1')!;
    h.textContent = text;
    // Restart the slam animation.
    h.style.animation = 'none';
    void h.offsetWidth;
    h.style.animation = '';
    this.announce.querySelector('p')!.textContent = sub;
    this.announce.classList.add('show');
    this.announceUntil = performance.now() + seconds * 1000;
  }

  public hideScreen(): void {
    this.screen.style.display = 'none';
    this.screen.innerHTML = '';
  }

  public loading(share: number): void {
    this.screen.style.display = 'flex';
    if (!this.screen.querySelector('.ak-loading')) this.screen.innerHTML = `<h2>AKHADA</h2><div class="sub">THE GHATS OF KASHI</div><div class="ak-loading"><i></i></div>`;
    (this.screen.querySelector('.ak-loading i') as HTMLElement).style.width = `${share * 100}%`;
  }

  public select(roster: Contender[], pick: number, modes: string[], mode: number, arena: StageDef): void {
    this.screen.style.display = 'flex';
    const c = roster[pick];
    this.screen.innerHTML = `
      <h2>AKHADA</h2><div class="sub">ASURAS OF THE EPICS · अखाड़ा</div>
      <div class="ak-roster">${roster.map((r, i) => `<div class="ak-card ${i === pick ? 'p1' : ''}"><div class="nm">${r.name}</div><div class="tt">${r.title}</div><div class="sw" style="background:${hex(r.colour)}"></div></div>`).join('')}</div>
      <div class="ak-bio"><b>${c.name}</b> · ${c.source}<br>${c.bio}</div>
      <div class="ak-arena"><span>◀ Q</span><div><b>${arena.name}</b> · ${arena.state}<small>${arena.legend}</small></div><span>E ▶</span></div>
      <div class="ak-opts">${modes.map((m, i) => `<div class="ak-opt ${i === mode ? 'on' : ''}">${m}</div>`).join('')}</div>
      <div class="ak-help">
        <kbd>A</kbd><kbd>D</kbd> fighter · <kbd>Q</kbd><kbd>E</kbd> arena · <kbd>W</kbd><kbd>S</kbd> mode · <kbd>ENTER</kbd> fight<br>
        P1: <kbd>W A S D</kbd> move, jump, crouch · <kbd>U</kbd> <kbd>I</kbd> punch · <kbd>J</kbd> <kbd>K</kbd> kick · hold back to block<br>
        ↓↘→ + punch: blast (<kbd>O</kbd>) · ↓↙← + kick: dash strike (<kbd>L</kbd>) · ↓↘→↓↘→ + punch with a full bar: super (<kbd>;</kbd>)<br>
        ↓↙← + punch: their signature (<kbd>P</kbd>) · →→ dash · ←← back-dash · <kbd>U</kbd>+<kbd>J</kbd> up close: throw · cancel a landed jab, cross or kick into a special for a combo<br>
        P2: arrows · numpad <kbd>4</kbd> <kbd>5</kbd> punch, <kbd>1</kbd> <kbd>2</kbd> kick, <kbd>6</kbd> blast, <kbd>3</kbd> dash, <kbd>0</kbd> super, <kbd>7</kbd> signature · gamepads work too
      </div>`;
  }

  /** Before an arcade fight: who, where, which fight of how many, and the rival's taunt. */
  public versus(me: Contender, rival: Contender, round: number, total: number, arena: StageDef): void {
    this.screen.style.display = 'flex';
    this.screen.innerHTML = `
      <div class="sub">FIGHT ${round} OF ${total} · ${arena.name.toUpperCase()} · ${arena.state.toUpperCase()}</div>
      <div class="ak-vs">
        <div style="color:${hex(me.colour)}"><b>${me.name}</b><small>${me.title}</small></div>
        <span>VS</span>
        <div style="color:${hex(rival.colour)}"><b>${rival.name}</b><small>${rival.title}</small></div>
      </div>
      <div class="ak-bio">“${rival.taunt}”<br><small>${rival.name} · ${rival.source}</small></div>
      <div class="ak-help"><kbd>ENTER</kbd> fight · <kbd>BACKSPACE</kbd> quit the ladder</div>`;
  }

  /** The ladder won. */
  public ending(me: Contender): void {
    this.screen.style.display = 'flex';
    this.screen.innerHTML = `<h2>${me.name}</h2><div class="sub">MASTER OF THE AKHADA · अखाड़े का स्वामी</div>
      <div class="ak-bio">Kashi to Kurukshetra, the shore of the Setu to the golden fort: every rival of the epics has
      fallen to ${me.name}, ${me.title.toLowerCase()}. The diyas burn on the ghats tonight in their name.</div>
      <div class="ak-help"><kbd>ENTER</kbd> fighter select</div>`;
  }

  public paused(): void {
    this.screen.style.display = 'flex';
    this.screen.innerHTML = `<h2>PAUSED</h2><div class="sub">ESC TO FIGHT ON · BACKSPACE FOR FIGHTER SELECT</div>`;
  }

  public results(winner: Contender, loserName: string, next = 'ENTER rematch'): void {
    this.screen.style.display = 'flex';
    this.screen.innerHTML = `<h2>${winner.name} WINS</h2><div class="sub">${winner.title.toUpperCase()} · ${loserName.toUpperCase()} FALLS</div>
      <div class="ak-help"><kbd>${next.split(' ')[0]}</kbd> ${next.split(' ').slice(1).join(' ')} · <kbd>BACKSPACE</kbd> fighter select</div>`;
  }
}
