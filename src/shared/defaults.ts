import { createNeutralControllerState } from './controller';
import type { AppSnapshot, Binding, MappingProfile, PhysicalKey, ProfileStoreDocument } from './types';
import { PROTOCOL_VERSION } from './types';

function key(scanCode: number, virtualKey: number, label: string, extended = false): PhysicalKey {
  return { scanCode, virtualKey, label, extended };
}

const defaultBindingData: Array<[PhysicalKey, Binding['target']]> = [
  [key(0x11, 0x57, 'W'), 'dpad-up'],
  [key(0x1e, 0x41, 'A'), 'dpad-left'],
  [key(0x1f, 0x53, 'S'), 'dpad-down'],
  [key(0x20, 0x44, 'D'), 'dpad-right'],
  [key(0x16, 0x55, 'U'), 'x'],
  [key(0x17, 0x49, 'I'), 'y'],
  [key(0x18, 0x4f, 'O'), 'rb'],
  [key(0x19, 0x50, 'P'), 'lb'],
  [key(0x24, 0x4a, 'J'), 'a'],
  [key(0x25, 0x4b, 'K'), 'b'],
  [key(0x26, 0x4c, 'L'), 'rt'],
  [key(0x27, 0xba, ';'), 'lt'],
  [key(0x01, 0x1b, 'Escape'), 'start'],
  [key(0x0e, 0x08, 'Backspace'), 'back'],
];

export function makeDefaultProfile(now = new Date().toISOString()): MappingProfile {
  return {
    id: 'default-fight-layout',
    name: 'Fight layout',
    schemaVersion: 1,
    bindings: defaultBindingData.map(([source, target], index) => ({
      id: `default-${index + 1}`,
      source,
      target,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function makeDefaultStore(): ProfileStoreDocument {
  const profile = makeDefaultProfile();
  return {
    schemaVersion: 1,
    activeProfileId: profile.id,
    profiles: [profile],
    passthrough: false,
    mouseEnabled: false,
  };
}

export function makeInitialSnapshot(platform: NodeJS.Platform = process.platform): AppSnapshot {
  const store = makeDefaultStore();
  return {
    profiles: store.profiles,
    activeProfileId: store.activeProfileId,
    controller: createNeutralControllerState(),
    runtime: {
      platform,
      helperState: 'starting',
      driverState: platform === 'win32' ? 'unknown' : 'unsupported',
      enabled: false,
      passthrough: store.passthrough,
      mouseEnabled: store.mouseEnabled,
      playerIndex: null,
      protocolVersion: PROTOCOL_VERSION,
      latencyMs: null,
    },
    pressedKeys: [],
    diagnostics: [],
    logs: [],
    captureTarget: null,
    notice: null,
  };
}
