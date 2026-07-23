import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/renderer/App';
import { getFightStickLeverPose } from '../src/renderer/fight-stick-pose';
import { makeInitialSnapshot } from '../src/shared/defaults';
import type { AppBridge } from '../src/shared/types';

let bridge: AppBridge;

beforeEach(() => {
  const snapshot = makeInitialSnapshot('darwin');
  snapshot.runtime.helperState = 'demo';
  snapshot.runtime.driverState = 'unsupported';
  snapshot.runtime.playerIndex = 0;
  snapshot.diagnostics = [
    {
      id: 'platform',
      label: 'Platform',
      status: 'info',
      detail: 'UI demo mode — virtual output requires Windows 10/11.',
    },
  ];
  bridge = {
    getSnapshot: vi.fn().mockResolvedValue(snapshot),
    setEnabled: vi.fn().mockResolvedValue(undefined),
    setPassthrough: vi.fn().mockResolvedValue(undefined),
    selectProfile: vi.fn().mockResolvedValue(undefined),
    createProfile: vi.fn().mockResolvedValue(snapshot.profiles[0]),
    renameProfile: vi.fn().mockResolvedValue(undefined),
    duplicateProfile: vi.fn().mockResolvedValue(snapshot.profiles[0]),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    removeBinding: vi.fn().mockResolvedValue(undefined),
    beginCapture: vi.fn().mockResolvedValue(undefined),
    cancelCapture: vi.fn().mockResolvedValue(undefined),
    installDriver: vi.fn().mockResolvedValue(undefined),
    recheck: vi.fn().mockResolvedValue(undefined),
    openControllerPanel: vi.fn().mockResolvedValue(undefined),
    onSnapshot: vi.fn().mockReturnValue(() => undefined),
  };
  Object.defineProperty(window, 'fightingGameStick', { configurable: true, value: bridge });
});

describe('App', () => {
  it('keeps horizontal and vertical fight-stick movement on their correct axes', () => {
    const poseFor = (...pressed: Array<'dpad-up' | 'dpad-down' | 'dpad-left' | 'dpad-right'>) => {
      const state = makeInitialSnapshot('darwin').controller;
      for (const target of pressed) state.buttons[target] = true;
      return getFightStickLeverPose(state);
    };

    expect(poseFor('dpad-up')).toEqual({ rotation: 0, verticalScale: 1.12 });
    expect(poseFor('dpad-down')).toEqual({ rotation: 0, verticalScale: 0.88 });
    expect(poseFor('dpad-left')).toEqual({ rotation: -15, verticalScale: 1 });
    expect(poseFor('dpad-right')).toEqual({ rotation: 15, verticalScale: 1 });
    expect(poseFor('dpad-up', 'dpad-right')).toEqual({ rotation: 15, verticalScale: 1.12 });
  });

  it('renders both device views and starts click-to-bind from accessible controls', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'See every input before the round starts.' })).toBeVisible();
    expect(screen.getByLabelText('Interactive Xbox controller')).toBeVisible();
    expect(screen.getByLabelText('Interactive eight-button fight stick')).toBeVisible();

    fireEvent.click(screen.getAllByRole('button', { name: 'Bind A' })[0]!);
    await waitFor(() => expect(bridge.beginCapture).toHaveBeenCalledWith('a'));

    fireEvent.click(screen.getByRole('button', { name: 'Bind QCF + A' }));
    await waitFor(() => expect(bridge.beginCapture).toHaveBeenCalledWith('qcf-a'));
  });

  it('exposes pass-through and diagnostics without hiding safety status', async () => {
    render(<App />);
    expect(await screen.findByText('Keyboard pass-through')).toBeVisible();
    const passthrough = screen.getByRole('checkbox', { name: 'Keyboard pass-through' });
    fireEvent.click(passthrough);
    await waitFor(() => expect(bridge.setPassthrough).toHaveBeenCalledWith(true));

    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(screen.getByRole('dialog', { name: 'Diagnostics' })).toBeVisible();
    expect(screen.getByText('UI demo mode — virtual output requires Windows 10/11.')).toBeVisible();
    expect(screen.getByText('Mapping is safely paused')).toBeVisible();
  });
});
