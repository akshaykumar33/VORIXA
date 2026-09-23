import '@fontsource/lilita-one/latin.css';
import type { RushPhase } from '../rush/RushSim';
import type { SchoolState, SchoolTrack } from '../rush/DrivingSchool';

/**
 * Rush's heads-up display: plain DOM over the canvas.
 *
 * DOM rather than canvas text because it is crisp at every pixel ratio, is readable by screen
 * readers, and animates with CSS at no cost to the frame budget. Every update compares against
 * the last value written, so a steady frame touches the DOM not at all.
 */

export interface HudState {
  phase: RushPhase;
  score: number;
  best: number;
  coins: number;
  hearts: number;
  maxHearts: number;
  nitro: number;
  nitroActive: boolean;
  combo: number;
  distance: number;
  kills: number;
}

export interface RunSummary {
  score: number;
  best: number;
  distance: number;
  kills: number;
  coins: number;
  /** Worlds reached, in order, as display names with a signature colour each. */
  worlds: { name: string; color: string }[];
}

export type Medal = 'gold' | 'silver' | 'bronze' | 'none';

/**
 * Medals are earned by how many worlds you reach, which gives every run a visible next goal:
 * "one more world for silver".
 */
export function medalFor(worldsReached: number): Medal {
  if (worldsReached >= 7) return 'gold';
  if (worldsReached >= 4) return 'silver';
  if (worldsReached >= 2) return 'bronze';
  return 'none';
}

const MEDAL_TEXT: Record<Medal, string> = {
  gold: 'GOLD',
  silver: 'SILVER',
  bronze: 'BRONZE',
  none: '—'
};

const MEDAL_HINT: Record<Medal, string> = {
  gold: 'Seven worlds. Legendary.',
  silver: 'Reach 7 worlds for gold',
  bronze: 'Reach 4 worlds for silver',
  none: 'Reach a second world for bronze'
};

export type DeviceStatus = 'off' | 'loading' | 'on' | 'lost' | 'error';

export interface DeviceState {
  gaze: DeviceStatus;
  hand: DeviceStatus;
  /** Where the eyes or hand currently point, -1..1, for the lane indicator. Null when unknown. */
  pointer: number | null;
}

const CSS = /* css */ `
body.rush #hud, body.rush #overlay-canvas { display: none !important; }
body.rush.racing #render-canvas { cursor: none; }
#rush-hud {
  --ink: #1d1b33; --cream: #fff7e0; --coral: #ff5a36; --sun: #ffd23f; --sky: #3fa7ff;
  --grape: #9b6bff; --mint: #2ec4b6;
  position: absolute; inset: 0; pointer-events: none; user-select: none;
  font-family: 'Lilita One', 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif;
  color: #fff; letter-spacing: 0.02em;
}
#rush-hud [hidden] { display: none !important; }
#rush-hud .toon {
  -webkit-text-stroke: 6px var(--ink); paint-order: stroke fill;
  text-shadow: 0 5px 0 var(--ink);
}
#rush-hud .score-block { position: absolute; top: max(16px, env(safe-area-inset-top)); left: 20px; }
#rush-hud .score { font-size: clamp(34px, 6vw, 58px); line-height: 1; }
#rush-hud .sub { display: flex; gap: 14px; margin-top: 8px; font-size: clamp(16px, 2.4vw, 22px); }
#rush-hud .sub span { display: inline-flex; align-items: center; gap: 6px; }
#rush-hud .coin-icon {
  width: 0.9em; height: 0.9em; border-radius: 50%; background: var(--sun);
  box-shadow: inset 0 -3px 0 #e0a800, 0 0 0 3px var(--ink);
}
#rush-hud .hearts { position: absolute; top: max(18px, env(safe-area-inset-top)); right: 20px; display: flex; gap: 8px; }
#rush-hud .heart { width: clamp(30px, 4.5vw, 42px); transition: transform 0.25s cubic-bezier(.3,1.6,.5,1), opacity 0.2s; }
#rush-hud .heart.lost { transform: scale(0.7) rotate(-12deg); opacity: 0.35; filter: grayscale(1); }
#rush-hud .combo {
  position: absolute; top: calc(max(18px, env(safe-area-inset-top)) + 54px); right: 22px;
  font-size: clamp(24px, 3.6vw, 34px); color: var(--sun); opacity: 0; transform: scale(0.6);
  transition: opacity 0.15s, transform 0.2s cubic-bezier(.3,1.8,.5,1);
}
#rush-hud .combo.on { opacity: 1; transform: scale(1); }
#rush-hud .combo.bump { animation: rush-bump 0.25s cubic-bezier(.3,1.8,.5,1); }
#rush-hud .nitro {
  position: absolute; left: 50%; bottom: max(22px, env(safe-area-inset-bottom)); transform: translateX(-50%);
  width: min(320px, 70vw); display: flex; align-items: center; gap: 10px;
}
#rush-hud .nitro .label { font-size: 18px; color: var(--sky); }
#rush-hud .nitro .track {
  flex: 1; height: 18px; border-radius: 12px; background: rgba(29,27,51,0.55);
  box-shadow: 0 0 0 4px var(--ink), 0 5px 0 4px var(--ink); overflow: hidden;
}
#rush-hud .nitro .fill {
  height: 100%; width: 50%; border-radius: 12px;
  background: linear-gradient(180deg, #8fe1ff, #2fb3ff 60%, #1d8fe0);
  transition: width 0.12s linear;
}
#rush-hud .nitro.active .fill { background: linear-gradient(180deg, #fff3b0, #ffa62b 60%, #ff5a36); }
#rush-hud .nitro .key {
  font-size: 13px; padding: 3px 7px; border-radius: 7px; background: var(--cream); color: var(--ink);
  box-shadow: 0 3px 0 var(--ink);
}
#rush-hud .crosshair {
  position: absolute; width: 38px; height: 38px; margin: -19px 0 0 -19px; left: 50%; top: 40%;
  border-radius: 50%; border: 4px solid #fff; box-shadow: 0 0 0 3px var(--ink), inset 0 0 0 3px var(--ink);
  transition: transform 0.12s, border-color 0.12s, opacity 0.2s;
}
#rush-hud .crosshair::after {
  content: ''; position: absolute; left: 50%; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px;
  border-radius: 50%; background: #fff; box-shadow: 0 0 0 3px var(--ink);
}
#rush-hud .crosshair.locked { border-color: #ff4fd8; transform: scale(0.8); }
#rush-hud .crosshair.hidden { opacity: 0; }
#rush-hud .devices {
  position: absolute; left: 20px; bottom: max(20px, env(safe-area-inset-bottom));
  display: flex; flex-direction: column; gap: 8px; pointer-events: auto;
}
#rush-hud .chip {
  font: inherit; font-size: 15px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
  padding: 6px 12px 6px 8px; border: none; border-radius: 999px; color: var(--ink); background: var(--cream);
  box-shadow: 0 0 0 3px var(--ink), 0 4px 0 3px var(--ink); transition: transform 0.1s;
}
#rush-hud .chip:hover { transform: translateY(-1px); }
#rush-hud .chip:active { transform: translateY(2px); box-shadow: 0 0 0 3px var(--ink), 0 1px 0 3px var(--ink); }
#rush-hud .chip:focus-visible { outline: 3px solid var(--sky); outline-offset: 4px; }
#rush-hud .chip kbd {
  font: inherit; font-size: 12px; padding: 1px 6px; border-radius: 6px; background: var(--ink); color: var(--cream);
}
#rush-hud .chip .dot { width: 10px; height: 10px; border-radius: 50%; background: #b8b3c9; }
#rush-hud .chip[data-status="on"] .dot { background: #3ddc84; }
#rush-hud .chip[data-status="loading"] .dot { background: var(--sun); animation: rush-pulse 0.8s infinite; }
#rush-hud .chip[data-status="lost"] .dot, #rush-hud .chip[data-status="error"] .dot { background: var(--coral); }
#rush-hud .lanes {
  display: flex; gap: 4px; padding: 5px; border-radius: 10px; background: rgba(29,27,51,0.5); width: 120px;
  position: relative; box-shadow: 0 0 0 3px var(--ink);
}
#rush-hud .lanes i { flex: 1; height: 10px; border-radius: 5px; background: rgba(255,255,255,0.25); }
#rush-hud .lanes b {
  position: absolute; top: 3px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%;
  background: #ff4fd8; box-shadow: 0 0 0 2px var(--ink); transition: left 0.08s linear;
}
#rush-hud .popup {
  position: absolute; font-size: 26px; transform: translate(-50%, -50%); animation: rush-pop 0.8s ease-out forwards;
}
#rush-hud .flash { position: absolute; inset: 0; opacity: 0; }
#rush-hud .flash.crash { background: radial-gradient(ellipse at center, transparent 40%, rgba(255,74,92,0.7)); animation: rush-flash 0.45s ease-out; }
#rush-hud .speed {
  position: absolute; inset: 0; opacity: 0; transition: opacity 0.3s;
  background: radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(63,167,255,0.35));
}
#rush-hud .speed.on { opacity: 1; }
#rush-hud .card {
  position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%);
  width: min(560px, calc(100vw - 32px)); padding: 26px 28px 24px; border-radius: 28px; text-align: center;
  background: var(--cream); color: var(--ink); pointer-events: auto;
  box-shadow: 0 0 0 5px var(--ink), 0 10px 0 5px var(--ink);
  animation: rush-in 0.45s cubic-bezier(.3,1.5,.5,1);
}
#rush-hud .card[hidden] { display: none; }
#rush-hud .logo { font-size: clamp(46px, 9vw, 78px); line-height: 0.95; color: var(--coral); margin: 0; }
#rush-hud .logo span { color: var(--sun); display: block; }
#rush-hud .tagline { font-family: system-ui, sans-serif; font-weight: 700; font-size: 16px; margin: 12px 0 18px; opacity: 0.8; letter-spacing: 0; }
#rush-hud .controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 10px; text-align: left; }
#rush-hud .control { background: #fff; border-radius: 16px; padding: 10px 12px; box-shadow: 0 0 0 3px var(--ink); }
#rush-hud .control h3 { margin: 0 0 4px; font-weight: 400; font-size: 18px; }
#rush-hud .control p { margin: 0; font-family: system-ui, sans-serif; font-size: 12.5px; line-height: 1.45; letter-spacing: 0; }
#rush-hud .cta {
  margin-top: 18px; font-size: 22px; color: #fff; animation: rush-bob 1.2s ease-in-out infinite;
}
#rush-hud .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 16px 0 4px; }
#rush-hud .stat { background: #fff; border-radius: 14px; padding: 8px; box-shadow: 0 0 0 3px var(--ink); }
#rush-hud .stat b { display: block; font-weight: 400; font-size: 28px; }
#rush-hud .stat small { font-family: system-ui, sans-serif; font-weight: 700; font-size: 12px; opacity: 0.7; letter-spacing: 0.04em; }
#rush-hud .record { color: var(--coral); font-size: 20px; min-height: 1.2em; margin-top: 6px; }
#rush-hud .muted {
  position: absolute; top: 76px; left: 20px; font-size: 14px; padding: 4px 10px; border-radius: 999px;
  background: var(--ink); color: var(--cream);
}
/* The title is laid over the live road rather than boxed over it: the car cruising behind the
   logo is the best advert the game has. */
#rush-hud .card.title {
  inset: 0; left: 0; top: 0; transform: none; width: auto; padding: 0; background: none; box-shadow: none;
  border-radius: 0; animation: none; pointer-events: none;
}
/* Logo, tagline and prompt flow in one column, so no screen height can make them collide. */
#rush-hud .title .head {
  position: absolute; left: 50%; top: max(14px, 4vh); transform: translateX(-50%);
  width: min(620px, calc(100vw - 32px)); display: flex; flex-direction: column; align-items: center; gap: 8px;
}
#rush-hud .title .logo { font-size: clamp(40px, min(10vw, 12vh), 96px); animation: rush-in 0.6s cubic-bezier(.3,1.5,.5,1); }
#rush-hud .title .tagline {
  margin: 0; color: #fff; opacity: 1;
  font-family: 'Lilita One', system-ui, sans-serif; font-weight: 400; font-size: clamp(16px, 2.2vw, 20px);
  -webkit-text-stroke: 4px var(--ink); paint-order: stroke fill; text-shadow: 0 3px 0 var(--ink);
}
#rush-hud .title .cta { margin: 0; font-size: clamp(20px, 3vw, 28px); }
/* Controls sit in a column on the right so the car, centre stage in the showroom, is never covered. */
#rush-hud .title .controls {
  position: absolute; right: 16px; top: 50%; transform: translateY(-40%); width: 210px; gap: 8px;
  grid-template-columns: 1fr;
}
#rush-hud .title .control { padding: 8px 10px; }
#rush-hud .title .control h3 { font-size: 16px; }
#rush-hud .title .control p { font-size: 11.5px; }
#rush-hud.ready .nitro, #rush-hud.ready .devices .lanes, #rush-hud.ready .score-block { display: none; }
#rush-hud .banner {
  position: absolute; left: 50%; top: 22%; transform: translateX(-50%); text-align: center; white-space: nowrap;
  opacity: 0; pointer-events: none;
}
#rush-hud .banner small { display: block; font-size: clamp(16px, 2.2vw, 22px); color: var(--cream); }
#rush-hud .banner b { display: block; font-weight: 400; font-size: clamp(34px, 6vw, 60px); color: var(--sun); }
#rush-hud .banner.show { animation: rush-banner 2.6s cubic-bezier(.2,1.2,.4,1) forwards; }
@keyframes rush-banner {
  0% { opacity: 0; transform: translateX(-50%) scale(0.6) rotate(-4deg); }
  12% { opacity: 1; transform: translateX(-50%) scale(1.08) rotate(1deg); }
  20% { transform: translateX(-50%) scale(1) rotate(0); }
  80% { opacity: 1; transform: translateX(-50%) scale(1); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.95); }
}
#rush-hud .garage {
  position: absolute; left: 50%; bottom: max(18px, env(safe-area-inset-bottom)); transform: translateX(-50%);
  display: flex; align-items: center; gap: 12px; pointer-events: auto;
}
#rush-hud .garage button {
  font: inherit; font-size: 20px; width: 40px; height: 40px; border: none; border-radius: 50%; cursor: pointer;
  background: var(--cream); color: var(--ink); box-shadow: 0 0 0 3px var(--ink), 0 4px 0 3px var(--ink);
}
#rush-hud .garage button:active { transform: translateY(2px); box-shadow: 0 0 0 3px var(--ink), 0 1px 0 3px var(--ink); }
#rush-hud .garage button:focus-visible { outline: 3px solid var(--sky); outline-offset: 4px; }
#rush-hud .garage .car { min-width: 190px; text-align: center; }
#rush-hud .garage .car b { display: block; font-weight: 400; font-size: 26px; color: #fff; }
#rush-hud .garage .car small { display: block; font-size: 14px; color: var(--cream); -webkit-text-stroke: 3px var(--ink); }
#rush-hud .card.over { width: min(600px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; }
#rush-hud .medal {
  width: 76px; height: 76px; margin: 0 auto 6px; border-radius: 50%; display: grid; place-items: center;
  font-size: 15px; letter-spacing: 0.06em; color: var(--ink);
  box-shadow: 0 0 0 5px var(--ink), 0 7px 0 5px var(--ink), inset 0 -8px 0 rgba(0,0,0,0.15);
}
#rush-hud .medal[data-tier="gold"] { background: radial-gradient(circle at 35% 30%, #fff3b0, #ffd23f 55%, #e0a800); }
#rush-hud .medal[data-tier="silver"] { background: radial-gradient(circle at 35% 30%, #ffffff, #d6dbe8 55%, #a9b0c4); }
#rush-hud .medal[data-tier="bronze"] { background: radial-gradient(circle at 35% 30%, #ffd9b0, #e8955a 55%, #b0602c); }
#rush-hud .medal[data-tier="none"] { background: #fff; }
#rush-hud .medal-hint { font-family: system-ui, sans-serif; font-weight: 700; font-size: 13px; opacity: 0.7; letter-spacing: 0; }
#rush-hud .stats { grid-template-columns: repeat(3, 1fr); }
#rush-hud .worlds { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 12px 0 4px; }
#rush-hud .worlds span {
  font-size: 13px; padding: 4px 10px; border-radius: 999px; color: #fff; box-shadow: 0 0 0 2px var(--ink);
  -webkit-text-stroke: 3px var(--ink); paint-order: stroke fill;
}
#rush-hud .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 16px; }
#rush-hud .btn {
  font: inherit; font-size: 18px; padding: 10px 18px; border: none; border-radius: 16px; cursor: pointer;
  background: #fff; color: var(--ink); box-shadow: 0 0 0 3px var(--ink), 0 5px 0 3px var(--ink);
}
#rush-hud .btn.primary { background: var(--coral); color: #fff; -webkit-text-stroke: 4px var(--ink); paint-order: stroke fill; }
#rush-hud .btn:active { transform: translateY(3px); box-shadow: 0 0 0 3px var(--ink), 0 2px 0 3px var(--ink); }
#rush-hud .btn:focus-visible { outline: 3px solid var(--sky); outline-offset: 5px; }
#rush-hud .btn kbd { font: inherit; font-size: 12px; padding: 1px 6px; margin-left: 6px; border-radius: 6px; background: var(--ink); color: var(--cream); -webkit-text-stroke: 0; }
#rush-hud .share-note { min-height: 1.3em; margin-top: 10px; font-family: system-ui, sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 0; }
#rush-hud .card.pause .logo { font-size: clamp(40px, 7vw, 60px); }
#rush-hud .school-link {
  font: inherit; font-size: 16px; padding: 6px 14px; border: none; border-radius: 999px; cursor: pointer; pointer-events: auto;
  background: var(--cream); color: var(--ink); box-shadow: 0 0 0 3px var(--ink), 0 4px 0 3px var(--ink);
}
#rush-hud .school-link kbd { font: inherit; font-size: 12px; padding: 1px 6px; margin-left: 6px; border-radius: 6px; background: var(--ink); color: var(--cream); }
#rush-hud .owl { width: 64px; height: 64px; flex: none; }
#rush-hud .card.picker { text-align: center; }
#rush-hud .card.picker .owl { width: 84px; height: 84px; margin: 0 auto; display: block; }
#rush-hud .tracks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
#rush-hud .tracks .btn { display: flex; flex-direction: column; gap: 4px; padding: 12px 8px; }
#rush-hud .tracks .btn small { font-family: system-ui, sans-serif; font-weight: 700; font-size: 11.5px; letter-spacing: 0; opacity: 0.75; -webkit-text-stroke: 0; }
#rush-hud .lesson {
  position: absolute; left: 50%; top: max(12px, env(safe-area-inset-top)); transform: translateX(-50%);
  width: min(620px, calc(100vw - 32px)); display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px;
  border-radius: 22px; background: var(--cream); color: var(--ink); pointer-events: auto;
  box-shadow: 0 0 0 4px var(--ink), 0 7px 0 4px var(--ink);
}
#rush-hud .lesson .body { flex: 1; min-width: 0; }
#rush-hud .lesson .step { font-size: 13px; opacity: 0.7; letter-spacing: 0.05em; }
#rush-hud .lesson h3 { margin: 0; font-weight: 400; font-size: 22px; }
#rush-hud .lesson p { margin: 4px 0 8px; font-family: system-ui, sans-serif; font-weight: 700; font-size: 15px; letter-spacing: 0; }
#rush-hud .lesson .hint, #rush-hud .lesson .problem { font-family: system-ui, sans-serif; font-size: 13px; letter-spacing: 0; margin: 0 0 8px; }
#rush-hud .lesson .problem { color: #c2262f; font-weight: 700; }
#rush-hud .lesson .bar { height: 12px; border-radius: 8px; background: #e6dfcc; box-shadow: 0 0 0 2px var(--ink); overflow: hidden; }
#rush-hud .lesson .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #3ddc84, #2ec4b6); transition: width 0.12s; }
#rush-hud .lesson .row { display: flex; gap: 8px; margin-top: 8px; }
#rush-hud .lesson .btn { font-size: 14px; padding: 6px 12px; border-radius: 12px; }
#rush-hud.school .score-block, #rush-hud.school .hearts, #rush-hud.school .combo { display: none; }
@keyframes rush-pop { 0% { opacity: 0; transform: translate(-50%, -30%) scale(0.5); } 20% { opacity: 1; transform: translate(-50%, -60%) scale(1.15); } 100% { opacity: 0; transform: translate(-50%, -160%) scale(1); } }
@keyframes rush-bump { 50% { transform: scale(1.35); } }
@keyframes rush-flash { 0% { opacity: 1; } 100% { opacity: 0; } }
@keyframes rush-in { 0% { opacity: 0; transform: translate(-50%, -40%) scale(0.85); } }
@keyframes rush-bob { 50% { transform: translateY(-4px); } }
@keyframes rush-pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) {
  #rush-hud *, #rush-hud *::before, #rush-hud *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
/* Short screens (landscape laptops, phones on their side): the results must fit without scrolling. */
@media (max-height: 700px) {
  #rush-hud .card.over { padding: 12px 20px 14px; }
  #rush-hud .card.over .medal { width: 54px; height: 54px; font-size: 11px; }
  #rush-hud .card.over .logo { font-size: 38px !important; }
  #rush-hud .card.over .stats { gap: 6px; margin: 8px 0 2px; }
  #rush-hud .card.over .stat { padding: 4px; }
  #rush-hud .card.over .stat b { font-size: 21px; }
  #rush-hud .card.over .worlds { margin: 8px 0 2px; }
  #rush-hud .card.over .actions { margin-top: 10px; }
}
@media (max-width: 900px) {
  #rush-hud .controls { grid-template-columns: 1fr 1fr; }
  /* No room for the column on a phone; the tagline and the chips carry the essentials. */
  #rush-hud .title .controls { display: none; }
  #rush-hud.ready .devices { bottom: calc(max(18px, env(safe-area-inset-bottom)) + 76px); }
  #rush-hud .devices { bottom: 70px; }
}
`;

const HEART_SVG = `<svg viewBox="0 0 32 30" aria-hidden="true"><path d="M16 28 C 4 19, 1 13, 1 8.5 C 1 4, 4.5 1, 8.5 1 C 12 1, 14.5 3, 16 6 C 17.5 3, 20 1, 23.5 1 C 27.5 1, 31 4, 31 8.5 C 31 13, 28 19, 16 28 Z" fill="#ff4a6a" stroke="#1d1b33" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="9" cy="8" rx="3" ry="2" fill="#fff" opacity="0.8"/></svg>`;

const MARKUP = `
  <div class="speed"></div>
  <div class="flash"></div>
  <div class="banner toon" role="status" aria-live="polite"><small>Welcome to</small><b></b></div>
  <div class="crosshair hidden"></div>
  <div class="score-block">
    <div class="score toon" aria-label="Score">0</div>
    <div class="sub toon"><span><i class="coin-icon"></i><b class="coins">0</b></span><span class="dist">0 m</span></div>
  </div>
  <div class="muted" hidden>MUTED · M</div>
  <div class="hearts" role="img" aria-label="3 hearts left"></div>
  <div class="combo toon">x2</div>
  <div class="nitro"><span class="label toon">NITRO</span><div class="track"><div class="fill"></div></div><span class="key">SHIFT</span></div>
  <div class="devices">
    <button class="chip gaze" data-status="off" type="button"><span class="dot"></span>Eyes steer <kbd>E</kbd></button>
    <button class="chip hand" data-status="off" type="button"><span class="dot"></span>Hands <kbd>G</kbd></button>
    <div class="lanes" hidden><i></i><i></i><i></i><b></b></div>
  </div>
  <section class="card title" aria-labelledby="rush-logo">
    <div class="head">
    <h1 class="logo toon" id="rush-logo">VORIXA<span>RUSH</span></h1>
    <p class="tagline">Dodge traffic, smash crates, blast drones. Three hearts. How far can you go?</p>
    <div class="cta toon">Press Space, an arrow key or click to start</div>
    </div>
    <div class="controls">
      <div class="control"><h3>Keys</h3><p>A / D or ← → change lane<br>Space jump · Shift nitro<br>J fire</p></div>
      <div class="control"><h3>Mouse</h3><p>Move to aim<br>Hold click to fire</p></div>
      <div class="control"><h3>Eyes · E</h3><p>Look at a lane to steer there<br>Hard blink: slow-mo</p></div>
      <div class="control"><h3>Hands · G</h3><p>Palm left/right steers<br>Fist jumps · pinch fires<br>Raise open hand: nitro</p></div>
    </div>
    <button class="school-link" type="button">Driving school<kbd>T</kbd></button>
    <div class="garage" role="group" aria-label="Choose your car">
      <button class="prev" type="button" aria-label="Previous car">◀</button>
      <div class="car toon" aria-live="polite"><b>Zippy</b><small>Open-top racer · C to switch</small></div>
      <button class="next" type="button" aria-label="Next car">▶</button>
    </div>
  </section>
  <section class="card over" hidden aria-labelledby="rush-over-title">
    <div class="medal" data-tier="none">—</div>
    <div class="medal-hint"></div>
    <h2 class="logo toon" id="rush-over-title" style="font-size:clamp(40px,7vw,62px)">WRECKED!</h2>
    <div class="record toon" aria-live="polite"></div>
    <div class="stats">
      <div class="stat"><b class="o-score">0</b><small>SCORE</small></div>
      <div class="stat"><b class="o-best">0</b><small>BEST</small></div>
      <div class="stat"><b class="o-dist">0 m</b><small>DISTANCE</small></div>
      <div class="stat"><b class="o-kills">0</b><small>BLASTED</small></div>
      <div class="stat"><b class="o-coins">0</b><small>COINS</small></div>
      <div class="stat"><b class="o-worlds">1</b><small>WORLDS</small></div>
    </div>
    <div class="worlds" aria-label="Worlds reached"></div>
    <div class="actions">
      <button class="btn primary again" type="button">Race again<kbd>R</kbd></button>
      <button class="btn garage-btn" type="button">Garage<kbd>C</kbd></button>
      <button class="btn share" type="button">Share this road</button>
    </div>
    <div class="share-note" role="status" aria-live="polite"></div>
  </section>
  <section class="card picker" hidden aria-labelledby="rush-school-title">
    <svg class="owl" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="38" rx="22" ry="22" fill="#b07a45" stroke="#1d1b33" stroke-width="3"/><ellipse cx="32" cy="44" rx="13" ry="12" fill="#f2cf9a"/><circle cx="23" cy="33" r="8" fill="#fff" stroke="#1d1b33" stroke-width="2.5"/><circle cx="41" cy="33" r="8" fill="#fff" stroke="#1d1b33" stroke-width="2.5"/><circle cx="24" cy="34" r="3.5" fill="#1d1b33"/><circle cx="40" cy="34" r="3.5" fill="#1d1b33"/><path d="M29 40 L35 40 L32 45 Z" fill="#ff9f1c" stroke="#1d1b33" stroke-width="2" stroke-linejoin="round"/><path d="M12 14 L32 6 L52 14 L32 22 Z" fill="#1d1b33"/><rect x="24" y="15" width="16" height="7" fill="#1d1b33"/><path d="M52 14 L52 26" stroke="#ffd23f" stroke-width="2.5"/><circle cx="52" cy="27" r="2.5" fill="#ffd23f"/></svg>
    <h2 class="logo toon" id="rush-school-title" style="font-size:clamp(30px,5vw,44px)">DRIVING SCHOOL</h2>
    <p class="tagline" style="color:var(--ink);-webkit-text-stroke:0;margin:6px 0 0">Professor Owl checks every move live. Pick a lesson.</p>
    <div class="tracks">
      <button class="btn track-keys" type="button">Keys &amp; mouse<small>Steer, jump, blast, nitro</small></button>
      <button class="btn track-eyes" type="button">Eyes<small>Calibrate, steer, slow-mo</small></button>
      <button class="btn track-hands" type="button">Hands<small>Palm, fist, pinch, raise</small></button>
    </div>
    <div class="actions"><button class="btn picker-back" type="button">Back</button></div>
  </section>
  <section class="lesson" hidden aria-live="polite">
    <svg class="owl" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="38" rx="22" ry="22" fill="#b07a45" stroke="#1d1b33" stroke-width="3"/><ellipse cx="32" cy="44" rx="13" ry="12" fill="#f2cf9a"/><circle cx="23" cy="33" r="8" fill="#fff" stroke="#1d1b33" stroke-width="2.5"/><circle cx="41" cy="33" r="8" fill="#fff" stroke="#1d1b33" stroke-width="2.5"/><circle cx="24" cy="34" r="3.5" fill="#1d1b33"/><circle cx="40" cy="34" r="3.5" fill="#1d1b33"/><path d="M29 40 L35 40 L32 45 Z" fill="#ff9f1c" stroke="#1d1b33" stroke-width="2" stroke-linejoin="round"/><path d="M12 14 L32 6 L52 14 L32 22 Z" fill="#1d1b33"/><rect x="24" y="15" width="16" height="7" fill="#1d1b33"/><path d="M52 14 L52 26" stroke="#ffd23f" stroke-width="2.5"/><circle cx="52" cy="27" r="2.5" fill="#ffd23f"/></svg>
    <div class="body">
      <div class="step"></div>
      <h3 class="toon-none"></h3>
      <p class="instruction"></p>
      <div class="problem" hidden></div>
      <div class="hint" hidden></div>
      <div class="bar"><i></i></div>
      <div class="row">
        <button class="btn lesson-skip" type="button">Skip</button>
        <button class="btn lesson-exit" type="button">Leave school</button>
      </div>
    </div>
  </section>
  <section class="card graduate" hidden aria-labelledby="rush-grad-title">
    <svg class="owl" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="38" rx="22" ry="22" fill="#b07a45" stroke="#1d1b33" stroke-width="3"/><ellipse cx="32" cy="44" rx="13" ry="12" fill="#f2cf9a"/><circle cx="23" cy="33" r="8" fill="#fff" stroke="#1d1b33" stroke-width="2.5"/><circle cx="41" cy="33" r="8" fill="#fff" stroke="#1d1b33" stroke-width="2.5"/><circle cx="24" cy="34" r="3.5" fill="#1d1b33"/><circle cx="40" cy="34" r="3.5" fill="#1d1b33"/><path d="M29 40 L35 40 L32 45 Z" fill="#ff9f1c" stroke="#1d1b33" stroke-width="2" stroke-linejoin="round"/><path d="M12 14 L32 6 L52 14 L32 22 Z" fill="#1d1b33"/><rect x="24" y="15" width="16" height="7" fill="#1d1b33"/><path d="M52 14 L52 26" stroke="#ffd23f" stroke-width="2.5"/><circle cx="52" cy="27" r="2.5" fill="#ffd23f"/></svg>
    <h2 class="logo toon" id="rush-grad-title" style="font-size:clamp(32px,6vw,52px)">YOU PASSED!</h2>
    <p class="tagline grad-text" style="color:var(--ink);-webkit-text-stroke:0"></p>
    <div class="actions">
      <button class="btn primary grad-race" type="button">Race now</button>
      <button class="btn grad-more" type="button">Another lesson</button>
    </div>
  </section>
  <section class="card pause" hidden aria-labelledby="rush-pause-title">
    <h2 class="logo toon" id="rush-pause-title">PAUSED</h2>
    <div class="actions">
      <button class="btn primary resume" type="button">Resume<kbd>P</kbd></button>
      <button class="btn garage-btn2" type="button">Quit to garage<kbd>C</kbd></button>
    </div>
  </section>
`;

const POPUP_POOL = 14;

export class RushHUD {
  private readonly root: HTMLElement;
  private readonly el: Record<string, HTMLElement> = {};
  private readonly hearts: HTMLElement[] = [];
  private readonly popups: HTMLElement[] = [];
  private nextPopup = 0;
  private last: Partial<HudState> = {};
  private lastDevices = '';

  public onToggleGaze: () => void = () => {};
  public onToggleHand: () => void = () => {};
  public onRaceAgain: () => void = () => {};
  public onGarage: () => void = () => {};
  public onShare: () => void = () => {};
  public onResume: () => void = () => {};
  public onOpenSchool: () => void = () => {};
  public onPickTrack: (track: SchoolTrack) => void = () => {};
  public onCloseSchool: () => void = () => {};
  public onSkipLesson: () => void = () => {};
  /** -1 or +1: the player asked for the previous or next car. */
  public onCycleVehicle: (step: number) => void = () => {};

  public constructor(container: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    document.body.classList.add('rush');

    this.root = document.createElement('div');
    this.root.id = 'rush-hud';
    this.root.innerHTML = MARKUP;
    container.appendChild(this.root);

    const q = (selector: string) => {
      const found = this.root.querySelector<HTMLElement>(selector);
      if (!found) throw new Error(`Rush HUD markup is missing ${selector}`);
      return found;
    };
    for (const [key, selector] of Object.entries({
      score: '.score', coins: '.coins', dist: '.dist', heartsBox: '.hearts', combo: '.combo',
      nitro: '.nitro', nitroFill: '.nitro .fill', crosshair: '.crosshair', title: '.card.title',
      over: '.card.over', record: '.record', oScore: '.o-score', oBest: '.o-best', oDist: '.o-dist',
      oKills: '.o-kills', oCoins: '.o-coins', oWorlds: '.o-worlds', worlds: '.worlds', medal: '.medal', medalHint: '.medal-hint',
      again: '.again', garageBtn: '.garage-btn', share: '.share', shareNote: '.share-note', pause: '.card.pause',
      resume: '.resume', garageBtn2: '.garage-btn2',
      schoolLink: '.school-link', picker: '.card.picker', trackKeys: '.track-keys', trackEyes: '.track-eyes', trackHands: '.track-hands',
      pickerBack: '.picker-back', lesson: '.lesson', lessonStep: '.lesson .step', lessonTitle: '.lesson h3',
      lessonText: '.lesson .instruction', lessonHint: '.lesson .hint', lessonProblem: '.lesson .problem', lessonBar: '.lesson .bar i',
      lessonSkip: '.lesson-skip', lessonExit: '.lesson-exit', graduate: '.card.graduate', gradText: '.grad-text',
      gradRace: '.grad-race', gradMore: '.grad-more', gaze: '.chip.gaze', hand: '.chip.hand', lanes: '.lanes', laneDot: '.lanes b',
      flash: '.flash', speed: '.speed', muted: '.muted', carName: '.garage .car b', carBlurb: '.garage .car small', carPrev: '.garage .prev', carNext: '.garage .next', banner: '.banner', bannerName: '.banner b'
    })) {
      this.el[key] = q(selector);
    }

    for (let i = 0; i < POPUP_POOL; i++) {
      const p = document.createElement('div');
      p.className = 'popup toon';
      p.hidden = true;
      p.addEventListener('animationend', () => (p.hidden = true));
      this.root.appendChild(p);
      this.popups.push(p);
    }

    // The chips are real buttons. Their presses must not also reach the game, where a mouse
    // press is "fire" and would start the race behind the player's back.
    for (const [chip, action] of [
      [this.el.gaze, () => this.onToggleGaze()],
      [this.el.hand, () => this.onToggleHand()],
      [this.el.carPrev, () => this.onCycleVehicle(-1)],
      [this.el.carNext, () => this.onCycleVehicle(1)],
      [this.el.again, () => this.onRaceAgain()],
      [this.el.garageBtn, () => this.onGarage()],
      [this.el.garageBtn2, () => this.onGarage()],
      [this.el.share, () => this.onShare()],
      [this.el.resume, () => this.onResume()],
      [this.el.schoolLink, () => this.onOpenSchool()],
      [this.el.trackKeys, () => this.onPickTrack('keys')],
      [this.el.trackEyes, () => this.onPickTrack('eyes')],
      [this.el.trackHands, () => this.onPickTrack('hands')],
      [this.el.pickerBack, () => this.onCloseSchool()],
      [this.el.lessonSkip, () => this.onSkipLesson()],
      [this.el.lessonExit, () => this.onCloseSchool()],
      [this.el.gradRace, () => this.onRaceAgain()],
      [this.el.gradMore, () => this.onOpenSchool()]
    ] as const) {
      chip.addEventListener('mousedown', (e) => e.stopPropagation());
      // Only the keys that press the button itself are held back — otherwise Space would press
      // the button *and* jump. Every other key (C, R, P, arrows) must still reach the game, or a
      // focused button silently swallows the controls.
      chip.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') e.stopPropagation();
      });
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        // A mouse click hands focus back to the game; keyboard activation (detail 0) keeps it,
        // so keyboard users can keep tabbing through the buttons.
        if (e.detail > 0) chip.blur();
        action();
      });
    }
  }

  public update(s: HudState): void {
    const last = this.last;
    if (s.score !== last.score) this.el.score.textContent = s.score.toLocaleString();
    if (s.coins !== last.coins) this.el.coins.textContent = String(s.coins);
    const metres = Math.floor(s.distance);
    if (metres !== last.distance) this.el.dist.textContent = `${metres.toLocaleString()} m`;

    if (s.hearts !== last.hearts || s.maxHearts !== last.maxHearts) {
      while (this.hearts.length < s.maxHearts) {
        const h = document.createElement('span');
        h.className = 'heart';
        h.innerHTML = HEART_SVG;
        this.el.heartsBox.appendChild(h);
        this.hearts.push(h);
      }
      this.hearts.forEach((h, i) => h.classList.toggle('lost', i >= s.hearts));
      this.el.heartsBox.setAttribute('aria-label', `${s.hearts} ${s.hearts === 1 ? 'heart' : 'hearts'} left`);
    }

    if (s.combo !== last.combo) {
      this.el.combo.textContent = `x${s.combo} COMBO`;
      this.el.combo.classList.toggle('on', s.combo > 1);
      if (s.combo > 1) {
        this.el.combo.classList.remove('bump');
        void this.el.combo.offsetWidth;
        this.el.combo.classList.add('bump');
      }
    }

    const nitroPct = Math.round(s.nitro * 100);
    if (nitroPct !== Math.round((last.nitro ?? -1) * 100)) this.el.nitroFill.style.width = `${nitroPct}%`;
    if (s.nitroActive !== last.nitroActive) {
      this.el.nitro.classList.toggle('active', s.nitroActive);
      this.el.speed.classList.toggle('on', s.nitroActive);
    }

    if (s.phase !== last.phase) {
      this.root.classList.toggle('ready', s.phase === 'ready');
      this.el.title.hidden = s.phase !== 'ready';
      this.el.over.hidden = s.phase !== 'over';
    }
    this.last = { ...s };
  }

  /** Fills and shows the results card, and puts keyboard focus on the obvious next action. */
  public showResults(r: RunSummary): void {
    const medal = medalFor(r.worlds.length);
    this.el.medal.dataset.tier = medal;
    this.el.medal.textContent = MEDAL_TEXT[medal];
    this.el.medalHint.textContent = MEDAL_HINT[medal];
    this.el.oScore.textContent = r.score.toLocaleString();
    this.el.oBest.textContent = Math.max(r.best, r.score).toLocaleString();
    this.el.oDist.textContent = `${Math.floor(r.distance).toLocaleString()} m`;
    this.el.oKills.textContent = String(r.kills);
    this.el.oCoins.textContent = String(r.coins);
    this.el.oWorlds.textContent = String(r.worlds.length);
    this.el.record.textContent = r.score > r.best && r.best > 0 ? 'NEW BEST!' : r.best === 0 ? 'FIRST RUN IN THE BOOKS!' : '';
    this.el.worlds.replaceChildren(
      ...r.worlds.map((w) => {
        const chip = document.createElement('span');
        chip.textContent = w.name;
        chip.style.background = w.color;
        return chip;
      })
    );
    this.el.shareNote.textContent = '';
    this.el.over.hidden = false;
    this.el.again.focus({ preventScroll: true });
  }

  public showSchoolPicker(visible: boolean): void {
    this.el.picker.hidden = !visible;
    this.el.title.hidden = visible || this.last.phase !== 'ready';
    if (visible) this.el.trackKeys.focus({ preventScroll: true });
  }

  /** Shows the current lesson, or hides the panel when `state` is null. */
  public setLesson(state: SchoolState | null): void {
    this.root.classList.toggle('school', state !== null);
    if (!state || state.done || !state.lesson) {
      this.el.lesson.hidden = true;
      return;
    }
    const l = state.lesson;
    this.el.lesson.hidden = false;
    this.el.lessonStep.textContent = `LESSON ${state.index + 1} OF ${state.total}`;
    if (this.el.lessonTitle.textContent !== l.title) this.el.lessonTitle.textContent = l.title;
    if (this.el.lessonText.textContent !== l.instruction) this.el.lessonText.textContent = l.instruction;
    this.el.lessonHint.hidden = !state.showHint;
    this.el.lessonHint.textContent = `Tip: ${l.hint}`;
    this.el.lessonProblem.hidden = state.problem === null;
    this.el.lessonProblem.textContent = state.problem ?? '';
    this.el.lessonBar.style.width = `${Math.round(state.progress * 100)}%`;
  }

  public showGraduation(visible: boolean, text = ''): void {
    this.el.graduate.hidden = !visible;
    this.el.gradText.textContent = text;
    if (visible) this.el.gradRace.focus({ preventScroll: true });
  }

  public setShareNote(text: string): void {
    this.el.shareNote.textContent = text;
  }

  public setPaused(paused: boolean): void {
    this.el.pause.hidden = !paused;
    if (paused) this.el.resume.focus({ preventScroll: true });
  }

  public setCrosshair(x: number, y: number, visible: boolean, locked: boolean): void {
    const c = this.el.crosshair;
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
    c.classList.toggle('hidden', !visible);
    c.classList.toggle('locked', locked);
  }

  public popup(text: string, x: number, y: number, color: string): void {
    const p = this.popups[this.nextPopup];
    this.nextPopup = (this.nextPopup + 1) % this.popups.length;
    p.hidden = false;
    p.textContent = text;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.color = color;
    // Restart the animation on a recycled node.
    p.style.animation = 'none';
    void p.offsetWidth;
    p.style.animation = '';
  }

  public setVehicle(name: string, blurb: string): void {
    this.el.carName.textContent = name;
    this.el.carBlurb.textContent = `${blurb} · C to switch`;
  }

  /** Announces a new world. */
  public banner(name: string): void {
    this.el.bannerName.textContent = name;
    const b = this.el.banner;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }

  public flashCrash(): void {
    const f = this.el.flash;
    f.classList.remove('crash');
    void f.offsetWidth;
    f.classList.add('crash');
  }

  public setMuted(muted: boolean): void {
    this.el.muted.hidden = !muted;
  }

  public setDevices(d: DeviceState): void {
    const key = `${d.gaze}|${d.hand}`;
    if (key !== this.lastDevices) {
      this.lastDevices = key;
      this.el.gaze.dataset.status = d.gaze;
      this.el.hand.dataset.status = d.hand;
      this.el.gaze.setAttribute('aria-pressed', String(d.gaze === 'on' || d.gaze === 'loading'));
      this.el.hand.setAttribute('aria-pressed', String(d.hand === 'on' || d.hand === 'loading'));
      this.el.lanes.hidden = !(d.gaze === 'on' || d.hand === 'on');
    }
    if (d.pointer !== null) {
      this.el.laneDot.style.left = `${(Math.max(-1, Math.min(1, d.pointer)) * 0.5 + 0.5) * 100}%`;
    }
  }
}
