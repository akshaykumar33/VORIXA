import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';

/**
 * Mute is an accessibility control, and the failure modes are quiet ones: a preference that does
 * not persist, a toggle that stops working after a tab switch, or a game that keeps its wind loop
 * running in a background tab forever.
 *
 * Verifying any of this through the browser proved unreliable — the harness could not deliver
 * synthetic key events into the running loop consistently — so the engine is driven directly
 * against a stubbed Web Audio graph instead.
 */

interface FakeParam {
  value: number;
  setValueAtTime: (v: number, t: number) => void;
  linearRampToValueAtTime: (v: number, t: number) => void;
  setTargetAtTime: (v: number, t: number, c: number) => void;
  cancelScheduledValues: (t: number) => void;
}

function makeParam(initial = 0): FakeParam {
  const param: FakeParam = {
    value: initial,
    // The stub applies ramps instantly. Scheduling fidelity is the browser's job; what matters
    // here is the *target* the engine asks for.
    setValueAtTime: (v) => void (param.value = v),
    linearRampToValueAtTime: (v) => void (param.value = v),
    setTargetAtTime: (v) => void (param.value = v),
    cancelScheduledValues: () => {}
  };
  return param;
}

function makeNode() {
  return { connect: vi.fn(), gain: makeParam(1), frequency: makeParam(20000), Q: makeParam(1) };
}

class FakeAudioContext {
  public currentTime = 0;
  public state: 'running' | 'suspended' = 'running';
  public destination = {};
  public suspend = vi.fn(async () => void (this.state = 'suspended'));
  public resume = vi.fn(async () => void (this.state = 'running'));
  public gains: ReturnType<typeof makeNode>[] = [];

  createDynamicsCompressor() {
    return {
      connect: vi.fn(),
      threshold: makeParam(),
      knee: makeParam(),
      ratio: makeParam(),
      attack: makeParam(),
      release: makeParam()
    };
  }
  createGain() {
    const node = makeNode();
    this.gains.push(node);
    return node;
  }
  createBiquadFilter() {
    return makeNode();
  }
  createBuffer() {
    return { getChannelData: () => new Float32Array(16) };
  }
  createBufferSource() {
    return { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), buffer: null, loop: false };
  }
  createOscillator() {
    return {
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      frequency: makeParam(),
      type: 'sine' as OscillatorType
    };
  }
}

let store: Record<string, string> = {};
let hidden = false;
const listeners: Record<string, (() => void)[]> = {};

beforeEach(() => {
  store = {};
  hidden = false;
  for (const key of Object.keys(listeners)) delete listeners[key];

  vi.stubGlobal('window', {
    AudioContext: FakeAudioContext,
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => void (store[k] = v)
    }
  });
  vi.stubGlobal('document', {
    get hidden() {
      return hidden;
    },
    addEventListener: (type: string, fn: () => void) => {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    }
  });
});

/** The master gain is the last gain node the engine creates during initialize. */
function masterGainOf(engine: AudioEngine): number {
  const ctx = (engine as unknown as { ctx: FakeAudioContext }).ctx;
  return ctx.gains[ctx.gains.length - 1].gain.value;
}

function fireVisibility(): void {
  for (const fn of listeners.visibilitychange ?? []) fn();
}

describe('mute', () => {
  it('starts unmuted and audible', () => {
    const engine = new AudioEngine();
    engine.initialize();
    expect(engine.isMuted).toBe(false);
    expect(masterGainOf(engine)).toBeGreaterThan(0);
  });

  it('silences the master bus when muted', () => {
    const engine = new AudioEngine();
    engine.initialize();
    expect(engine.toggleMute()).toBe(true);
    expect(masterGainOf(engine)).toBe(0);
  });

  it('restores level when unmuted', () => {
    const engine = new AudioEngine();
    engine.initialize();
    engine.toggleMute();
    expect(engine.toggleMute()).toBe(false);
    expect(masterGainOf(engine)).toBeGreaterThan(0);
  });

  it('persists the preference', () => {
    const engine = new AudioEngine();
    engine.initialize();
    engine.toggleMute();
    expect(store['vorixa.audio.muted']).toBe('1');
  });

  it('restores a stored preference on the next session', () => {
    // A setting that forgets itself is not a setting.
    store['vorixa.audio.muted'] = '1';
    const engine = new AudioEngine();
    engine.initialize();
    expect(engine.isMuted).toBe(true);
    expect(masterGainOf(engine)).toBe(0);
  });

  it('survives storage being unavailable', () => {
    // Private browsing throws on access. Audio must not fail over a preference.
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        }
      }
    });
    const engine = new AudioEngine();
    expect(() => engine.initialize()).not.toThrow();
    expect(() => engine.toggleMute()).not.toThrow();
  });
});

describe('background ducking', () => {
  it('suspends audio when the tab is hidden', () => {
    const engine = new AudioEngine();
    engine.initialize();
    const ctx = (engine as unknown as { ctx: FakeAudioContext }).ctx;

    hidden = true;
    fireVisibility();

    expect(ctx.suspend).toHaveBeenCalled();
    expect(masterGainOf(engine)).toBe(0);
  });

  it('does not un-mute a muted game when the tab comes back', () => {
    // Ducking and muting are separate states; returning to the tab must not override the
    // player's explicit choice.
    const engine = new AudioEngine();
    engine.initialize();
    engine.toggleMute();

    hidden = true;
    fireVisibility();
    hidden = false;
    fireVisibility();

    expect(engine.isMuted).toBe(true);
    expect(masterGainOf(engine)).toBe(0);
  });

  it('stops listening once disposed', () => {
    const engine = new AudioEngine();
    engine.initialize();
    expect(listeners.visibilitychange?.length).toBe(1);
    engine.dispose();
    expect(listeners.visibilitychange?.length).toBe(0);
  });
});

describe('time dilation filter', () => {
  function cutoffOf(engine: AudioEngine): number {
    return (engine as unknown as { dilationFilter: { frequency: FakeParam } }).dilationFilter
      .frequency.value;
  }

  it('is wide open at normal speed', () => {
    const engine = new AudioEngine();
    engine.initialize();
    engine.setDilation(0);
    expect(cutoffOf(engine)).toBeGreaterThan(15000);
  });

  it('rolls the mix off under dilation', () => {
    // Slow motion with a full-bandwidth mix reads as a bug; the brain trusts its ears.
    const engine = new AudioEngine();
    engine.initialize();
    engine.setDilation(1);
    expect(cutoffOf(engine)).toBeLessThan(1000);
  });

  it('moves monotonically between the two', () => {
    const engine = new AudioEngine();
    engine.initialize();
    engine.setDilation(0.25);
    const quarter = cutoffOf(engine);
    engine.setDilation(0.75);
    expect(cutoffOf(engine)).toBeLessThan(quarter);
  });

  it('clamps out-of-range input', () => {
    const engine = new AudioEngine();
    engine.initialize();
    engine.setDilation(-5);
    expect(cutoffOf(engine)).toBeGreaterThan(15000);
    engine.setDilation(99);
    expect(cutoffOf(engine)).toBeLessThan(1000);
  });
});
