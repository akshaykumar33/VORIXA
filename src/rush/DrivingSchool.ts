import { median, validateCalibration, type GazeCalibration } from './Calibration';

/**
 * Professor Owl's driving school: short lessons, each checked live.
 *
 * Every lesson is one instruction and one thing to do, and it only moves on when the game has
 * actually *seen* the player do it — "make a fist" completes when the hand tracker reports a fist,
 * not when a timer runs out. That is what makes it double as a diagnostic: if a gesture is not
 * being recognised, the player finds out here, with the camera preview beside them, instead of
 * mid-race wondering why nothing happens.
 *
 * Pure: a per-frame snapshot of what happened goes in, the lesson state comes out. The game
 * owns the simulation, the trackers and the HUD.
 */

export type SchoolTrack = 'keys' | 'eyes' | 'hands';

/** What happened this frame, as far as lessons care. */
export interface SchoolFrame {
  dt: number;
  lane: number;
  jumps: number;
  smashes: number;
  nitroActive: boolean;
  firing: boolean;
  gaze: { on: boolean; present: boolean; rawX: number; blinkStarted: boolean; dilating: boolean } | null;
  hand: { on: boolean; present: boolean; fistStarted: boolean; pinching: boolean; nitro: boolean } | null;
  /** True when eyes are steering, so hand steering is switched off. */
  eyesSteering: boolean;
}

/** Something the game should do for the lesson (place targets, top up nitro). */
export type SchoolRequest = 'crates' | 'nitro' | null;

export interface Lesson {
  id: string;
  title: string;
  /** What to do, in a sentence. */
  instruction: string;
  /** Shown if the player seems stuck. */
  hint: string;
  /** Set on entry, e.g. crates to shoot. */
  request: SchoolRequest;
  /** A lane to highlight on the road, for calibration and steering lessons. */
  highlightLane?: number;
}

const LESSONS: Record<SchoolTrack, Lesson[]> = {
  keys: [
    { id: 'lanes', title: 'Steering', instruction: 'Change lanes with A / D or the ← → arrow keys. Try it 4 times.', hint: 'Tap, don\'t hold: one press is one lane.', request: null },
    { id: 'jump', title: 'Jumping', instruction: 'Press Space to jump. Jump twice.', hint: 'Jumps clear barriers and slow cars — not trucks.', request: null },
    { id: 'shoot', title: 'Blasting', instruction: 'Move the mouse to aim and hold the left button (or J) to blast the 3 crates.', hint: 'The pink ring shows what you are locked on to.', request: 'crates' },
    { id: 'nitro', title: 'Nitro', instruction: 'Hold Shift for NITRO. Keep it lit for a moment.', hint: 'Nitro rams straight through traffic and barriers — but not trucks.', request: 'nitro' }
  ],
  eyes: [
    { id: 'eyes-on', title: 'Switch on your eyes', instruction: 'Press E and allow the camera. Look at the screen so your face is in the preview.', hint: 'Sit about an arm\'s length away, face lit from the front.', request: null },
    { id: 'cal-center', title: 'Calibrate · centre', instruction: 'Look at the MIDDLE lane and hold still.', hint: 'Look with your eyes and let your head turn naturally.', request: null, highlightLane: 0 },
    { id: 'cal-left', title: 'Calibrate · left', instruction: 'Now look at the LEFT lane and hold.', hint: 'Look at the far left of the road, not the edge of the screen.', request: null, highlightLane: -1 },
    { id: 'cal-right', title: 'Calibrate · right', instruction: 'Now look at the RIGHT lane and hold.', hint: 'Turn your head a little if your eyes alone do not move the dot.', request: null, highlightLane: 1 },
    { id: 'eye-steer', title: 'Steer with your eyes', instruction: 'Look at the left lane, then the right lane. The car follows your gaze.', hint: 'Watch the pink dot in the lane meter: it is where the game thinks you are looking.', request: null },
    { id: 'blink', title: 'Slow motion', instruction: 'Blink HARD — squeeze both eyes shut for a moment — to slow time.', hint: 'Normal blinks are ignored on purpose. Squeeze and hold for a quarter second.', request: null }
  ],
  hands: [
    { id: 'hand-on', title: 'Switch on your hands', instruction: 'Press G and hold your open hand up in front of the camera.', hint: 'Keep your whole hand in the preview, palm facing the camera.', request: null },
    { id: 'hand-steer', title: 'Steer with your hand', instruction: 'Move your open palm to the LEFT, then to the RIGHT.', hint: 'Move your whole hand sideways, about a hand-width from the middle.', request: null },
    { id: 'fist', title: 'Fist = jump', instruction: 'Close your hand into a FIST to jump. Do it twice (open between).', hint: 'Curl all four fingers in, then open again to re-arm.', request: null },
    { id: 'pinch', title: 'Pinch = fire', instruction: 'PINCH your thumb and index finger together to blast the crates.', hint: 'Touch the fingertips and hold — it keeps firing while you pinch.', request: 'crates' },
    { id: 'hand-nitro', title: 'Raised hand = nitro', instruction: 'Open your hand wide and RAISE it high in the camera view.', hint: 'An open hand at normal height does nothing — lift it toward the top of the preview.', request: 'nitro' }
  ]
};

/** How long a calibration pose is held, and how long a "keep it up" goal must last. */
const HOLD_SECONDS = 1.2;
/** Time to move the eyes to a new calibration target before sampling starts. */
const SETTLE_SECONDS = 0.6;
/** After this long on one lesson, the hint is shown. */
const HINT_AFTER = 7;

export interface SchoolState {
  track: SchoolTrack;
  lesson: Lesson | null;
  index: number;
  total: number;
  /** 0–1 progress through the current lesson. */
  progress: number;
  showHint: boolean;
  /** Set when a calibration attempt was rejected; the lesson restarts with this advice. */
  problem: string | null;
  done: boolean;
}

export class DrivingSchool {
  private index = 0;
  private progress = 0;
  private timeOnLesson = 0;
  private counter = 0;
  private hold = 0;
  private lastLane = 0;
  private sawLeft = false;
  private samples: number[] = [];
  private cal: Partial<GazeCalibration> = {};
  private problem: string | null = null;
  /** The request for the lesson just entered; read once by the game. */
  public pendingRequest: SchoolRequest = null;
  /** Filled when eye calibration completes successfully. */
  public calibration: GazeCalibration | null = null;

  public constructor(public readonly track: SchoolTrack) {
    this.enter(0);
  }

  public get lessons(): readonly Lesson[] {
    return LESSONS[this.track];
  }

  public get state(): SchoolState {
    const lessons = this.lessons;
    const done = this.index >= lessons.length;
    return {
      track: this.track,
      lesson: done ? null : lessons[this.index],
      index: Math.min(this.index, lessons.length),
      total: lessons.length,
      progress: done ? 1 : this.progress,
      showHint: this.timeOnLesson > HINT_AFTER,
      problem: this.problem,
      done
    };
  }

  /** Moves on without completing, for players who already know a lesson or cannot do it. */
  public skip(): void {
    this.enter(this.index + 1);
  }

  private enter(index: number): void {
    this.index = index;
    this.progress = 0;
    this.timeOnLesson = 0;
    this.counter = 0;
    this.hold = 0;
    this.sawLeft = false;
    this.samples = [];
    const lesson = this.lessons[index];
    this.pendingRequest = lesson ? lesson.request : null;
  }

  private complete(): void {
    this.problem = null;
    this.enter(this.index + 1);
  }

  public update(f: SchoolFrame): void {
    const lesson = this.lessons[this.index];
    if (!lesson) return;
    this.timeOnLesson += f.dt;
    const laneChanged = f.lane !== this.lastLane;
    this.lastLane = f.lane;

    switch (lesson.id) {
      case 'lanes':
        if (laneChanged) this.counter++;
        this.progress = this.counter / 4;
        break;
      case 'jump':
      case 'fist':
        this.counter += f.jumps;
        this.progress = this.counter / 2;
        break;
      case 'shoot':
        this.counter += f.smashes;
        this.progress = this.counter / 3;
        break;
      case 'pinch':
        this.counter += f.smashes;
        this.progress = this.counter / 2;
        break;
      case 'nitro':
        this.holdWhile(f.nitroActive, f.dt);
        break;
      case 'hand-nitro':
        this.holdWhile(f.nitroActive && (f.hand?.nitro ?? false), f.dt);
        break;
      case 'eyes-on':
        this.holdWhile(f.gaze?.on === true && f.gaze.present, f.dt, 0.6);
        break;
      case 'hand-on':
        this.holdWhile(f.hand?.on === true && f.hand.present, f.dt, 0.6);
        break;
      case 'cal-center':
      case 'cal-left':
      case 'cal-right':
        this.calibrate(lesson.id, f);
        break;
      case 'eye-steer':
      case 'hand-steer': {
        // Eyes and hands never steer at once; if the eyes own steering, hand steering is moot.
        if (lesson.id === 'hand-steer' && f.eyesSteering) {
          this.complete();
          return;
        }
        if (f.lane === -1) this.sawLeft = true;
        this.progress = this.sawLeft ? (f.lane === 1 ? 1 : 0.5) : 0;
        break;
      }
      case 'blink':
        if (f.gaze?.blinkStarted) this.progress = 1;
        break;
    }
    if (this.progress >= 1) this.complete();
  }

  private holdWhile(condition: boolean, dt: number, seconds = HOLD_SECONDS): void {
    // Progress decays rather than resets, so a flicker in tracking does not wipe out a good hold.
    this.hold = condition ? this.hold + dt : Math.max(0, this.hold - dt * 0.5);
    this.progress = Math.min(this.hold / seconds, 1);
  }

  private calibrate(id: string, f: SchoolFrame): void {
    // The eyes are still travelling from the last target; sampling now would blend the two.
    if (this.timeOnLesson < SETTLE_SECONDS) return;
    const g = f.gaze;
    // Only steady, open-eyed, tracked frames count: a blink drags the gaze reading around.
    if (g?.present && !g.dilating) {
      this.samples.push(g.rawX);
      this.hold += f.dt;
    }
    this.progress = Math.min(this.hold / HOLD_SECONDS, 1);
    if (this.progress < 1) return;

    const value = median(this.samples);
    if (id === 'cal-center') this.cal.center = value;
    if (id === 'cal-left') this.cal.left = value;
    if (id === 'cal-right') {
      this.cal.right = value;
      const cal = { left: this.cal.left ?? -0.3, center: this.cal.center ?? 0, right: value };
      const problem = validateCalibration(cal);
      if (problem) {
        // Start the three poses again, with advice.
        this.problem = problem;
        this.cal = {};
        this.enter(this.lessons.findIndex((l) => l.id === 'cal-center'));
        this.progress = 0;
        return;
      }
      this.calibration = cal;
    }
    this.complete();
  }
}
