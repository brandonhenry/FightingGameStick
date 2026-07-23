import { describe, expect, it, vi } from 'vitest';
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
});
