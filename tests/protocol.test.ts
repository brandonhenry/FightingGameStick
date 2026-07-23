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

  it('accepts supported motion shortcuts and rejects arbitrary macros', () => {
    const profile = makeDefaultProfile();
    profile.bindings[0]!.target = 'qcf-a';
    expect(mappingProfileSchema.safeParse(profile).success).toBe(true);
    const malformed = structuredClone(profile) as { bindings: Array<{ target: string }> };
    malformed.bindings[0]!.target = 'qcf-delete-everything';
    expect(mappingProfileSchema.safeParse(malformed).success).toBe(false);
  });

  it('rejects malformed host messages', () => {
    expect(hostEventSchema.safeParse({ type: 'controller', state: { buttons: {} } }).success).toBe(false);
    expect(hostEventSchema.safeParse({ type: 'key', key: { scanCode: -1 }, down: true }).success).toBe(false);
  });

  it('carries and checks the protocol version', () => {
    const ready = { type: 'ready', protocolVersion: PROTOCOL_VERSION, playerIndex: null } as const;
    const parsed = hostEventSchema.parse(ready);
    expect(parsed.type === 'ready' && parsed.protocolVersion).toBe(2);
  });
});
