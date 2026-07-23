import { describe, expect, it } from 'vitest';
import { createNeutralControllerState } from '../src/shared/controller';
import { makeDefaultProfile } from '../src/shared/defaults';
import { controllerStateSchema, hostEventSchema, mappingProfileSchema } from '../src/shared/schemas';
import { PROTOCOL_VERSION } from '../src/shared/types';

describe('runtime contracts', () => {
  it('accepts current profiles and complete controller reports', () => {
    expect(mappingProfileSchema.safeParse(makeDefaultProfile()).success).toBe(true);
    expect(controllerStateSchema.safeParse(createNeutralControllerState()).success).toBe(true);
  });

  it('rejects malformed host messages', () => {
    expect(hostEventSchema.safeParse({ type: 'controller', state: { buttons: {} } }).success).toBe(false);
    expect(hostEventSchema.safeParse({ type: 'key', key: { scanCode: -1 }, down: true }).success).toBe(false);
  });

  it('carries and checks the protocol version', () => {
    const ready = { type: 'ready', protocolVersion: PROTOCOL_VERSION, playerIndex: null } as const;
    const parsed = hostEventSchema.parse(ready);
    expect(parsed.type === 'ready' && parsed.protocolVersion).toBe(1);
  });
});
