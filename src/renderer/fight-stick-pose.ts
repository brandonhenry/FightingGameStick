import type { ControllerState } from '../shared/types';

export function getFightStickLeverPose(state: ControllerState): { rotation: number; verticalScale: number } {
  const horizontal = state.buttons['dpad-left'] && !state.buttons['dpad-right'] ? -1 : state.buttons['dpad-right'] && !state.buttons['dpad-left'] ? 1 : 0;
  const vertical = state.buttons['dpad-up'] && !state.buttons['dpad-down'] ? -1 : state.buttons['dpad-down'] && !state.buttons['dpad-up'] ? 1 : 0;

  return {
    rotation: horizontal * 15,
    verticalScale: 1 - vertical * 0.12,
  };
}
