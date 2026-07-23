import {
  motionShortcutTargets,
  type BindingTarget,
  type ControllerTarget,
  type MotionShortcutTarget,
} from './types';

export const motionAttacks = ['x', 'y', 'rb', 'lb', 'a', 'b', 'rt', 'lt'] as const;
export type MotionAttack = (typeof motionAttacks)[number];
export type QuarterCircleMotion = 'qcf' | 'qcb';

export const MOTION_STEP_MS = 35;
export const MOTION_ATTACK_MS = 50;

export function isMotionShortcutTarget(target: BindingTarget): target is MotionShortcutTarget {
  return (motionShortcutTargets as readonly string[]).includes(target);
}

export function parseMotionShortcut(target: MotionShortcutTarget): {
  motion: QuarterCircleMotion;
  attack: MotionAttack;
} {
  const [motion, attack] = target.split('-') as [QuarterCircleMotion, MotionAttack];
  return { motion, attack };
}

export function motionShortcutLabel(target: MotionShortcutTarget): string {
  const { motion, attack } = parseMotionShortcut(target);
  return `${motion.toUpperCase()} + ${attack.toUpperCase()}`;
}

export function motionShortcutFrames(target: MotionShortcutTarget): ControllerTarget[][] {
  const { motion, attack } = parseMotionShortcut(target);
  const horizontal: ControllerTarget = motion === 'qcf' ? 'dpad-right' : 'dpad-left';
  return [
    ['dpad-down'],
    ['dpad-down', horizontal],
    [horizontal, attack],
  ];
}
