import { describe, expect, it } from 'vitest';
import { MappingEngine } from '../src/shared/mapping-engine';
import { motionShortcutFrames } from '../src/shared/motion-shortcuts';
import type { Binding, MappingProfile, PhysicalKey } from '../src/shared/types';

const key = (scanCode: number, label: string): PhysicalKey => ({ scanCode, virtualKey: scanCode, extended: false, label });
const binding = (source: PhysicalKey, target: Binding['target'], id = `${source.scanCode}-${target}`): Binding => ({
  id,
  source,
  target,
});

function profile(bindings: Binding[]): MappingProfile {
  return {
    id: 'test',
    name: 'Test',
    schemaVersion: 1,
    bindings,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('MappingEngine', () => {
  it('ignores repeat keydown events and releases cleanly', () => {
    const a = key(30, 'A');
    const engine = new MappingEngine(profile([binding(a, 'x')]));
    expect(engine.transition(a, true)?.buttons.x).toBe(true);
    expect(engine.transition(a, true)).toBeNull();
    expect(engine.transition(a, false)?.buttons.x).toBe(false);
    expect(engine.transition(a, false)).toBeNull();
  });

  it('reference-counts multiple keys targeting one output', () => {
    const a = key(30, 'A');
    const left = key(75, 'Left');
    const engine = new MappingEngine(profile([binding(a, 'dpad-left'), binding(left, 'dpad-left')]));
    engine.transition(a, true);
    engine.transition(left, true);
    expect(engine.transition(a, false)?.buttons['dpad-left']).toBe(true);
    expect(engine.transition(left, false)?.buttons['dpad-left']).toBe(false);
  });

  it('cleans opposing directions to neutral', () => {
    const left = key(30, 'Left');
    const right = key(32, 'Right');
    const up = key(17, 'Up');
    const down = key(31, 'Down');
    const engine = new MappingEngine(
      profile([
        binding(left, 'left-stick-left'),
        binding(right, 'left-stick-right'),
        binding(up, 'left-stick-up'),
        binding(down, 'left-stick-down'),
      ]),
    );
    engine.transition(left, true);
    expect(engine.transition(right, true)?.leftStick.x).toBe(0);
    engine.transition(up, true);
    expect(engine.transition(down, true)?.leftStick.y).toBe(0);
  });

  it('cleans opposing D-pad directions to neutral', () => {
    const left = key(30, 'Left');
    const right = key(32, 'Right');
    const up = key(17, 'Up');
    const down = key(31, 'Down');
    const engine = new MappingEngine(
      profile([
        binding(left, 'dpad-left'),
        binding(right, 'dpad-right'),
        binding(up, 'dpad-up'),
        binding(down, 'dpad-down'),
      ]),
    );
    engine.transition(left, true);
    let state = engine.transition(right, true)!;
    expect(state.buttons['dpad-left']).toBe(false);
    expect(state.buttons['dpad-right']).toBe(false);
    engine.transition(up, true);
    state = engine.transition(down, true)!;
    expect(state.buttons['dpad-up']).toBe(false);
    expect(state.buttons['dpad-down']).toBe(false);
  });

  it('normalizes digital diagonals to a circular range', () => {
    const up = key(17, 'Up');
    const right = key(32, 'Right');
    const engine = new MappingEngine(profile([binding(up, 'left-stick-up'), binding(right, 'left-stick-right')]));
    engine.transition(up, true);
    const state = engine.transition(right, true)!;
    expect(state.leftStick.x).toBeCloseTo(Math.SQRT1_2);
    expect(state.leftStick.y).toBeCloseTo(-Math.SQRT1_2);
    expect(Math.hypot(state.leftStick.x, state.leftStick.y)).toBeCloseTo(1);
  });

  it('uses digital trigger values and resets every held output', () => {
    const leftTrigger = key(38, 'L');
    const engine = new MappingEngine(profile([binding(leftTrigger, 'lt')]));
    expect(engine.transition(leftTrigger, true)?.leftTrigger).toBe(1);
    expect(engine.reset().leftTrigger).toBe(0);
  });

  it('replaces held state when a profile changes', () => {
    const a = key(30, 'A');
    const engine = new MappingEngine(profile([binding(a, 'a')]));
    engine.transition(a, true);
    const next = engine.configure(profile([binding(a, 'b')]));
    expect(next.buttons.a).toBe(false);
    expect(next.buttons.b).toBe(false);
  });

  it('overlays quarter-circle shortcuts without releasing held normal inputs', () => {
    const held = key(30, 'A');
    const shortcut = key(16, 'Q');
    const engine = new MappingEngine(profile([binding(held, 'x'), binding(shortcut, 'qcf-a')]));
    engine.transition(held, true);
    expect(engine.motionShortcutFor(shortcut)).toBe('qcf-a');

    const [down, diagonal, attack] = motionShortcutFrames('qcf-a');
    let state = engine.setMotionTargets('q', down!);
    expect(state.buttons['dpad-down']).toBe(true);
    expect(state.buttons.x).toBe(true);
    state = engine.setMotionTargets('q', diagonal!);
    expect(state.buttons['dpad-down']).toBe(true);
    expect(state.buttons['dpad-right']).toBe(true);
    state = engine.setMotionTargets('q', attack!);
    expect(state.buttons['dpad-right']).toBe(true);
    expect(state.buttons.a).toBe(true);
    expect(state.buttons.x).toBe(true);
    state = engine.setMotionTargets('q', null);
    expect(state.buttons.a).toBe(false);
    expect(state.buttons.x).toBe(true);
  });

  it('generates quarter-circle-back on the left side', () => {
    expect(motionShortcutFrames('qcb-b+x+rt')).toEqual([
      ['dpad-down'],
      ['dpad-down', 'dpad-left'],
      ['dpad-left', 'b', 'x', 'rt'],
    ]);
  });
});
