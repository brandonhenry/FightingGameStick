import { createNeutralControllerState } from './controller';
import { controllerChordTargets, isControllerChordTarget } from './controller-chords';
import { isMotionShortcutTarget } from './motion-shortcuts';
import type {
  ControllerState,
  ControllerTarget,
  MappingProfile,
  MotionShortcutTarget,
  PhysicalKey,
} from './types';

export function physicalKeyId(key: Pick<PhysicalKey, 'scanCode' | 'extended'>): string {
  return `${key.scanCode}:${key.extended ? 1 : 0}`;
}

export class MappingEngine {
  private profile: MappingProfile;
  private readonly pressed = new Set<string>();
  private readonly motionTargets = new Map<string, readonly ControllerTarget[]>();
  private sequence = 0;

  constructor(profile: MappingProfile) {
    this.profile = structuredClone(profile);
  }

  configure(profile: MappingProfile): ControllerState {
    this.profile = structuredClone(profile);
    this.pressed.clear();
    this.motionTargets.clear();
    return this.getState();
  }

  transition(key: PhysicalKey, down: boolean): ControllerState | null {
    const id = physicalKeyId(key);
    if (down) {
      if (this.pressed.has(id)) return null;
      this.pressed.add(id);
    } else {
      if (!this.pressed.delete(id)) return null;
    }
    return this.getState();
  }

  reset(): ControllerState {
    this.pressed.clear();
    this.motionTargets.clear();
    return this.getState();
  }

  isMapped(key: PhysicalKey): boolean {
    const id = physicalKeyId(key);
    return this.profile.bindings.some((binding) => physicalKeyId(binding.source) === id);
  }

  motionShortcutFor(key: PhysicalKey): MotionShortcutTarget | null {
    const id = physicalKeyId(key);
    const target = this.profile.bindings.find((binding) => physicalKeyId(binding.source) === id)?.target;
    return target && isMotionShortcutTarget(target) ? target : null;
  }

  setMotionTargets(runId: string, targets: readonly ControllerTarget[] | null): ControllerState {
    if (targets) this.motionTargets.set(runId, [...targets]);
    else this.motionTargets.delete(runId);
    return this.getState();
  }

  getState(): ControllerState {
    const state = createNeutralControllerState(++this.sequence);
    const active = new Set<ControllerTarget>();

    for (const binding of this.profile.bindings) {
      if (!this.pressed.has(physicalKeyId(binding.source)) || isMotionShortcutTarget(binding.target)) continue;
      if (isControllerChordTarget(binding.target)) {
        for (const target of controllerChordTargets(binding.target)) active.add(target);
      } else {
        active.add(binding.target);
      }
    }
    for (const targets of this.motionTargets.values()) {
      for (const target of targets) active.add(target);
    }

    for (const target of Object.keys(state.buttons) as Array<keyof typeof state.buttons>) {
      state.buttons[target] = active.has(target);
    }

    if (state.buttons['dpad-left'] && state.buttons['dpad-right']) {
      state.buttons['dpad-left'] = false;
      state.buttons['dpad-right'] = false;
    }
    if (state.buttons['dpad-up'] && state.buttons['dpad-down']) {
      state.buttons['dpad-up'] = false;
      state.buttons['dpad-down'] = false;
    }

    state.leftTrigger = active.has('lt') ? 1 : 0;
    state.rightTrigger = active.has('rt') ? 1 : 0;
    state.leftStick = resolveStick(active, 'left-stick');
    state.rightStick = resolveStick(active, 'right-stick');
    state.timestamp = Date.now();
    return state;
  }
}

function resolveStick(active: Set<ControllerTarget>, prefix: 'left-stick' | 'right-stick') {
  const left = active.has(`${prefix}-left` as ControllerTarget);
  const right = active.has(`${prefix}-right` as ControllerTarget);
  const up = active.has(`${prefix}-up` as ControllerTarget);
  const down = active.has(`${prefix}-down` as ControllerTarget);

  let x = left === right ? 0 : left ? -1 : 1;
  let y = up === down ? 0 : up ? -1 : 1;
  if (x !== 0 && y !== 0) {
    const normalized = Math.SQRT1_2;
    x *= normalized;
    y *= normalized;
  }
  return { x, y };
}
