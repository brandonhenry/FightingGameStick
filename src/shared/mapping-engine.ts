import { createNeutralControllerState } from './controller';
import type { ControllerState, ControllerTarget, MappingProfile, PhysicalKey } from './types';

export function physicalKeyId(key: Pick<PhysicalKey, 'scanCode' | 'extended'>): string {
  return `${key.scanCode}:${key.extended ? 1 : 0}`;
}

export class MappingEngine {
  private profile: MappingProfile;
  private readonly pressed = new Set<string>();
  private sequence = 0;

  constructor(profile: MappingProfile) {
    this.profile = structuredClone(profile);
  }

  configure(profile: MappingProfile): ControllerState {
    this.profile = structuredClone(profile);
    this.pressed.clear();
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
    return this.getState();
  }

  isMapped(key: PhysicalKey): boolean {
    const id = physicalKeyId(key);
    return this.profile.bindings.some((binding) => physicalKeyId(binding.source) === id);
  }

  getState(): ControllerState {
    const state = createNeutralControllerState(++this.sequence);
    const active = new Set<ControllerTarget>();

    for (const binding of this.profile.bindings) {
      if (this.pressed.has(physicalKeyId(binding.source))) active.add(binding.target);
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
