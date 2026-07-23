import type { BindingTarget, ControllerTarget, MotionShortcutTarget } from './types';

export const motionAttacks = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt'] as const;
export type MotionAttack = (typeof motionAttacks)[number];
export type QuarterCircleMotion = 'qcf' | 'qcb';

export const MOTION_STEP_MS = 35;
export const MOTION_ATTACK_MS = 50;

export function isMotionShortcutTarget(target: BindingTarget | string): target is MotionShortcutTarget {
  const [motion, chord, extra] = target.split('-');
  if (extra !== undefined || (motion !== 'qcf' && motion !== 'qcb') || !chord) return false;
  const attacks = chord.split('+');
  if (attacks.length < 1 || attacks.length > motionAttacks.length || new Set(attacks).size !== attacks.length) return false;
  const indexes = attacks.map((attack) => (motionAttacks as readonly string[]).indexOf(attack));
  return indexes.every((index) => index >= 0) && indexes.every((index, position) => position === 0 || index > indexes[position - 1]!);
}

export function parseMotionShortcut(target: MotionShortcutTarget): {
  motion: QuarterCircleMotion;
  attacks: MotionAttack[];
} {
  if (!isMotionShortcutTarget(target)) throw new Error(`Invalid motion shortcut: ${target}`);
  const [motion, chord] = target.split('-') as [QuarterCircleMotion, string];
  return { motion, attacks: chord.split('+') as MotionAttack[] };
}

export function createMotionShortcutTarget(
  motion: QuarterCircleMotion,
  attacks: readonly MotionAttack[],
): MotionShortcutTarget {
  const selected = new Set(attacks);
  const ordered = motionAttacks.filter((attack) => selected.has(attack));
  if (ordered.length === 0 || ordered.length !== selected.size) throw new Error('Select at least one valid attack button.');
  return `${motion}-${ordered.join('+')}`;
}

export function motionShortcutLabel(target: MotionShortcutTarget): string {
  const { motion, attacks } = parseMotionShortcut(target);
  return `${motion.toUpperCase()} + ${attacks.map((attack) => attack.toUpperCase()).join(' + ')}`;
}

export function motionShortcutFrames(target: MotionShortcutTarget): ControllerTarget[][] {
  const { motion, attacks } = parseMotionShortcut(target);
  const horizontal: ControllerTarget = motion === 'qcf' ? 'dpad-right' : 'dpad-left';
  return [
    ['dpad-down'],
    ['dpad-down', horizontal],
    [horizontal, ...attacks],
  ];
}
