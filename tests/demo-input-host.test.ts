import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoInputHost, type DemoKeyboardInput } from '../src/main/input-host';
import { makeDefaultProfile } from '../src/shared/defaults';
import type { HostEvent } from '../src/shared/types';

const input = (overrides: Partial<DemoKeyboardInput> = {}): DemoKeyboardInput => ({
  type: 'keyDown',
  key: 'w',
  code: 'KeyW',
  control: false,
  alt: false,
  isAutoRepeat: false,
  ...overrides,
});

describe('DemoInputHost safety decisions', () => {
  afterEach(() => vi.useRealTimers());
  it('blocks mapped keys only while enabled and pass-through is off', async () => {
    const host = new DemoInputHost();
    await host.start(makeDefaultProfile(), false);
    expect(host.handleInput(input())).toBe(false);
    host.handleInput(input({ type: 'keyUp' }));

    host.setEnabled(true);
    expect(host.handleInput(input())).toBe(true);
    host.handleInput(input({ type: 'keyUp' }));
    expect(host.handleInput(input({ code: 'KeyQ', key: 'q' }))).toBe(false);

    host.setPassthrough(true);
    host.handleInput(input({ type: 'keyUp', code: 'KeyQ', key: 'q' }));
    expect(host.handleInput(input())).toBe(false);
    await host.stop();
  });

  it('panic-disables and neutralizes output', async () => {
    const host = new DemoInputHost();
    const events: HostEvent[] = [];
    host.onEvent((event) => events.push(event));
    await host.start(makeDefaultProfile(), false);
    host.setEnabled(true);
    host.handleInput(input());

    const emergency = host.handleInput(
      input({ code: 'F12', key: 'F12', control: true, alt: true }),
    );
    expect(emergency).toBe(true);
    expect(events).toContainEqual({ type: 'enabled', value: false, reason: 'Emergency shortcut' });
    const reports = events.filter((event): event is Extract<HostEvent, { type: 'controller' }> => event.type === 'controller');
    expect(reports.at(-1)?.state.buttons['dpad-up']).toBe(false);
    await host.stop();
  });

  it('captures a key once without forwarding it as a controller transition', async () => {
    const host = new DemoInputHost();
    const capture = vi.fn();
    host.onEvent((event) => event.type === 'capture' && capture(event));
    await host.start(makeDefaultProfile(), false);
    host.capture('a');
    expect(host.handleInput(input({ code: 'KeyQ', key: 'q' }))).toBe(true);
    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0]?.[0].target).toBe('a');
    await host.stop();
  });

  it('plays and previews a complete QCF plus simultaneous attack chord', async () => {
    vi.useFakeTimers();
    const host = new DemoInputHost();
    const profile = makeDefaultProfile();
    profile.bindings.find((binding) => binding.source.label === 'W')!.target = 'qcf-a+b+y';
    const reports: Array<Extract<HostEvent, { type: 'controller' }>['state']> = [];
    host.onEvent((event) => event.type === 'controller' && reports.push(event.state));
    await host.start(profile, false);
    host.setEnabled(true);

    expect(host.handleInput(input())).toBe(true);
    expect(reports.at(-1)?.buttons['dpad-down']).toBe(true);
    await vi.advanceTimersByTimeAsync(35);
    expect(reports.at(-1)?.buttons['dpad-right']).toBe(true);
    expect(reports.at(-1)?.buttons['dpad-down']).toBe(true);
    await vi.advanceTimersByTimeAsync(35);
    expect(reports.at(-1)?.buttons['dpad-right']).toBe(true);
    expect(reports.at(-1)?.buttons.a).toBe(true);
    expect(reports.at(-1)?.buttons.b).toBe(true);
    expect(reports.at(-1)?.buttons.y).toBe(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(reports.at(-1)?.buttons['dpad-right']).toBe(false);
    expect(reports.at(-1)?.buttons.a).toBe(false);
    expect(reports.at(-1)?.buttons.b).toBe(false);
    expect(reports.at(-1)?.buttons.y).toBe(false);
    await host.stop();
  });

  it('cancels an in-flight motion and releases every output when paused', async () => {
    vi.useFakeTimers();
    const host = new DemoInputHost();
    const profile = makeDefaultProfile();
    profile.bindings.find((binding) => binding.source.label === 'W')!.target = 'qcb-b';
    const reports: Array<Extract<HostEvent, { type: 'controller' }>['state']> = [];
    host.onEvent((event) => event.type === 'controller' && reports.push(event.state));
    await host.start(profile, false);
    host.setEnabled(true);
    host.handleInput(input());
    await vi.advanceTimersByTimeAsync(35);
    host.setEnabled(false);

    expect(Object.values(reports.at(-1)!.buttons).every((pressed) => !pressed)).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(Object.values(reports.at(-1)!.buttons).every((pressed) => !pressed)).toBe(true);
    await host.stop();
  });
});
