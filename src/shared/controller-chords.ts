import type { BindingTarget, ControllerChordTarget, ControllerTarget } from './types';

export const controllerChordButtons = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt'] as const;
export type ControllerChordButton = (typeof controllerChordButtons)[number];

export function isControllerChordTarget(target: BindingTarget | string): target is ControllerChordTarget {
  if (!target.startsWith('chord-')) return false;
  const buttons = target.slice('chord-'.length).split('+');
  if (
    buttons.length < 2 ||
    buttons.length > controllerChordButtons.length ||
    new Set(buttons).size !== buttons.length
  ) {
    return false;
  }
  const indexes = buttons.map((button) => (controllerChordButtons as readonly string[]).indexOf(button));
  return indexes.every((index) => index >= 0) &&
    indexes.every((index, position) => position === 0 || index > indexes[position - 1]!);
}

export function parseControllerChord(target: ControllerChordTarget): ControllerChordButton[] {
  if (!isControllerChordTarget(target)) throw new Error(`Invalid controller chord: ${target}`);
  return target.slice('chord-'.length).split('+') as ControllerChordButton[];
}

export function createControllerChordTarget(
  buttons: readonly ControllerChordButton[],
): ControllerChordTarget {
  const selected = new Set(buttons);
  const ordered = controllerChordButtons.filter((button) => selected.has(button));
  if (ordered.length < 2 || ordered.length !== selected.size) {
    throw new Error('Select at least two valid controller buttons.');
  }
  return `chord-${ordered.join('+')}`;
}

export function controllerChordLabel(target: ControllerChordTarget): string {
  return parseControllerChord(target).map((button) => button.toUpperCase()).join(' + ');
}

export function controllerChordTargets(target: ControllerChordTarget): ControllerTarget[] {
  return [...parseControllerChord(target)];
}
