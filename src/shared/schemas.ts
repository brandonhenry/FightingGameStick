import { z } from 'zod';
import { bindingTargets, controllerTargets, digitalButtonTargets, motionShortcutTargets, PROTOCOL_VERSION } from './types';

export const controllerTargetSchema = z.enum(controllerTargets);
export const motionShortcutTargetSchema = z.enum(motionShortcutTargets);
export const bindingTargetSchema = z.enum(bindingTargets);
export const digitalButtonTargetSchema = z.enum(digitalButtonTargets);

export const physicalKeySchema = z.object({
  scanCode: z.number().int().nonnegative().max(0xffff),
  virtualKey: z.number().int().nonnegative().max(0xffff),
  extended: z.boolean(),
  label: z.string().trim().min(1).max(32),
});

export const bindingSchema = z.object({
  id: z.string().min(1).max(128),
  source: physicalKeySchema,
  target: bindingTargetSchema,
});

export const mappingProfileSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(48),
  schemaVersion: z.literal(1),
  bindings: z.array(bindingSchema).max(256),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const profileStoreSchema = z.object({
  schemaVersion: z.literal(1),
  activeProfileId: z.string().min(1),
  profiles: z.array(mappingProfileSchema).min(1).max(100),
  passthrough: z.boolean(),
});

const stickSchema = z.object({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) });

export const controllerStateSchema = z.object({
  buttons: z.record(digitalButtonTargetSchema, z.boolean()),
  leftStick: stickSchema,
  rightStick: stickSchema,
  leftTrigger: z.number().min(0).max(1),
  rightTrigger: z.number().min(0).max(1),
  sequence: z.number().int().nonnegative(),
  timestamp: z.number().nonnegative(),
});

export const hostEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    protocolVersion: z.number().int(),
    driverVersion: z.string().optional(),
    playerIndex: z.number().int().min(0).max(3).nullable(),
  }),
  z.object({
    type: z.literal('key'),
    key: physicalKeySchema,
    down: z.boolean(),
    timestamp: z.number().nonnegative(),
  }),
  z.object({ type: z.literal('capture'), key: physicalKeySchema, target: bindingTargetSchema }),
  z.object({ type: z.literal('controller'), state: controllerStateSchema }),
  z.object({ type: z.literal('enabled'), value: z.boolean(), reason: z.string().optional() }),
  z.object({
    type: z.literal('fault'),
    code: z.string(),
    message: z.string(),
    recoverable: z.boolean(),
  }),
  z.object({ type: z.literal('pong'), sentAt: z.number(), receivedAt: z.number() }),
  z.object({
    type: z.literal('log'),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string(),
  }),
]);

export const protocolVersionSchema = z.literal(PROTOCOL_VERSION);
