export const PROTOCOL_VERSION = 3 as const;

export const controllerTargets = [
  'dpad-up',
  'dpad-down',
  'dpad-left',
  'dpad-right',
  'left-stick-up',
  'left-stick-down',
  'left-stick-left',
  'left-stick-right',
  'right-stick-up',
  'right-stick-down',
  'right-stick-left',
  'right-stick-right',
  'a',
  'b',
  'x',
  'y',
  'lb',
  'rb',
  'lt',
  'rt',
  'back',
  'start',
  'left-stick-click',
  'right-stick-click',
] as const;

export type ControllerTarget = (typeof controllerTargets)[number];

export type MotionShortcutTarget = `qcf-${string}` | `qcb-${string}`;
export type BindingTarget = ControllerTarget | MotionShortcutTarget;

export const digitalButtonTargets = [
  'dpad-up',
  'dpad-down',
  'dpad-left',
  'dpad-right',
  'a',
  'b',
  'x',
  'y',
  'lb',
  'rb',
  'back',
  'start',
  'left-stick-click',
  'right-stick-click',
] as const;

export type DigitalButtonTarget = (typeof digitalButtonTargets)[number];

export interface PhysicalKey {
  scanCode: number;
  virtualKey: number;
  extended: boolean;
  label: string;
}

export interface Binding {
  id: string;
  source: PhysicalKey;
  target: BindingTarget;
}

export interface MappingProfile {
  id: string;
  name: string;
  schemaVersion: 1;
  bindings: Binding[];
  createdAt: string;
  updatedAt: string;
}

export interface StickState {
  x: number;
  y: number;
}

export interface ControllerState {
  buttons: Record<DigitalButtonTarget, boolean>;
  leftStick: StickState;
  rightStick: StickState;
  leftTrigger: number;
  rightTrigger: number;
  sequence: number;
  timestamp: number;
}

export type HelperState = 'starting' | 'ready' | 'demo' | 'stopped' | 'fault';
export type DriverState = 'ready' | 'missing' | 'unsupported' | 'unknown';

export interface RuntimeStatus {
  platform: NodeJS.Platform;
  helperState: HelperState;
  driverState: DriverState;
  enabled: boolean;
  passthrough: boolean;
  playerIndex: number | null;
  protocolVersion: number;
  driverVersion?: string;
  lastError?: string;
  latencyMs: number | null;
}

export interface PressedKey extends PhysicalKey {
  pressedAt: number;
  mappedTarget?: BindingTarget;
}

export interface DiagnosticResult {
  id: 'platform' | 'helper' | 'driver' | 'controller' | 'keyboard-hook' | 'steam';
  label: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  detail: string;
  action?: 'install-driver' | 'open-controller-panel' | 'recheck';
}

export interface AppSnapshot {
  profiles: MappingProfile[];
  activeProfileId: string;
  controller: ControllerState;
  runtime: RuntimeStatus;
  pressedKeys: PressedKey[];
  diagnostics: DiagnosticResult[];
  logs: string[];
  captureTarget: BindingTarget | null;
  notice: { id: number; message: string } | null;
}

export interface ProfileStoreDocument {
  schemaVersion: 1;
  activeProfileId: string;
  profiles: MappingProfile[];
  passthrough: boolean;
}

export type HostCommand =
  | { type: 'initialize'; protocolVersion: number; profile: MappingProfile; passthrough: boolean }
  | { type: 'configure'; profile: MappingProfile }
  | { type: 'enable'; value: boolean }
  | { type: 'passthrough'; value: boolean }
  | { type: 'capture'; target: BindingTarget }
  | { type: 'cancel-capture' }
  | { type: 'reset' }
  | { type: 'ping'; sentAt: number }
  | { type: 'shutdown' };

export type HostEvent =
  | {
      type: 'ready';
      protocolVersion: number;
      driverVersion?: string;
      playerIndex: number | null;
    }
  | { type: 'key'; key: PhysicalKey; down: boolean; timestamp: number }
  | { type: 'capture'; key: PhysicalKey; target: BindingTarget }
  | { type: 'controller'; state: ControllerState }
  | { type: 'enabled'; value: boolean; reason?: string }
  | { type: 'fault'; code: string; message: string; recoverable: boolean }
  | { type: 'pong'; sentAt: number; receivedAt: number }
  | { type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string };

export interface AppBridge {
  getSnapshot(): Promise<AppSnapshot>;
  setEnabled(value: boolean): Promise<void>;
  setPassthrough(value: boolean): Promise<void>;
  selectProfile(profileId: string): Promise<void>;
  createProfile(name?: string): Promise<MappingProfile>;
  renameProfile(profileId: string, name: string): Promise<void>;
  duplicateProfile(profileId: string): Promise<MappingProfile>;
  deleteProfile(profileId: string): Promise<void>;
  removeBinding(bindingId: string): Promise<void>;
  beginCapture(target: BindingTarget): Promise<void>;
  cancelCapture(): Promise<void>;
  installDriver(): Promise<void>;
  recheck(): Promise<void>;
  openControllerPanel(): Promise<void>;
  onSnapshot(callback: (snapshot: AppSnapshot) => void): () => void;
}
