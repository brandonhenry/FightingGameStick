import {
  controllerTargets,
  digitalButtonTargets,
  type BindingTarget,
  type ControllerState,
  type ControllerTarget,
  type DigitalButtonTarget,
} from './types';
import { isMotionShortcutTarget, motionShortcutLabel } from './motion-shortcuts';

export const targetLabels: Record<ControllerTarget, string> = {
  'dpad-up': 'D-pad up',
  'dpad-down': 'D-pad down',
  'dpad-left': 'D-pad left',
  'dpad-right': 'D-pad right',
  'left-stick-up': 'Left stick up',
  'left-stick-down': 'Left stick down',
  'left-stick-left': 'Left stick left',
  'left-stick-right': 'Left stick right',
  'right-stick-up': 'Right stick up',
  'right-stick-down': 'Right stick down',
  'right-stick-left': 'Right stick left',
  'right-stick-right': 'Right stick right',
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  lb: 'Left bumper',
  rb: 'Right bumper',
  lt: 'Left trigger',
  rt: 'Right trigger',
  back: 'Back',
  start: 'Start',
  'left-stick-click': 'Left stick click',
  'right-stick-click': 'Right stick click',
};

export const targetShortLabels: Record<ControllerTarget, string> = {
  ...targetLabels,
  'dpad-up': 'D↑',
  'dpad-down': 'D↓',
  'dpad-left': 'D←',
  'dpad-right': 'D→',
  'left-stick-up': 'LS↑',
  'left-stick-down': 'LS↓',
  'left-stick-left': 'LS←',
  'left-stick-right': 'LS→',
  'right-stick-up': 'RS↑',
  'right-stick-down': 'RS↓',
  'right-stick-left': 'RS←',
  'right-stick-right': 'RS→',
  lb: 'LB',
  rb: 'RB',
  lt: 'LT',
  rt: 'RT',
  'left-stick-click': 'L3',
  'right-stick-click': 'R3',
};

export function bindingTargetLabel(target: BindingTarget): string {
  return isMotionShortcutTarget(target) ? motionShortcutLabel(target) : targetLabels[target];
}

export function bindingTargetShortLabel(target: BindingTarget): string {
  return isMotionShortcutTarget(target) ? motionShortcutLabel(target) : targetShortLabels[target];
}

export function createNeutralControllerState(sequence = 0): ControllerState {
  const buttons = Object.fromEntries(
    digitalButtonTargets.map((target) => [target, false]),
  ) as Record<DigitalButtonTarget, boolean>;

  return {
    buttons,
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    leftTrigger: 0,
    rightTrigger: 0,
    sequence,
    timestamp: Date.now(),
  };
}

export function isTargetActive(state: ControllerState, target: ControllerTarget): boolean {
  if ((digitalButtonTargets as readonly string[]).includes(target)) {
    return state.buttons[target as DigitalButtonTarget];
  }
  switch (target) {
    case 'left-stick-up':
      return state.leftStick.y < -0.1;
    case 'left-stick-down':
      return state.leftStick.y > 0.1;
    case 'left-stick-left':
      return state.leftStick.x < -0.1;
    case 'left-stick-right':
      return state.leftStick.x > 0.1;
    case 'right-stick-up':
      return state.rightStick.y < -0.1;
    case 'right-stick-down':
      return state.rightStick.y > 0.1;
    case 'right-stick-left':
      return state.rightStick.x < -0.1;
    case 'right-stick-right':
      return state.rightStick.x > 0.1;
    case 'lt':
      return state.leftTrigger > 0.1;
    case 'rt':
      return state.rightTrigger > 0.1;
    default:
      return false;
  }
}

export const allTargets = controllerTargets;
