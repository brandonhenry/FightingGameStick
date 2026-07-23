import { EventEmitter } from 'node:events';
import type { ControllerTarget, DiagnosticResult, HostEvent, MappingProfile, PhysicalKey } from '../shared/types';
import { createNeutralControllerState } from '../shared/controller';
import { makeInitialSnapshot } from '../shared/defaults';
import { physicalKeyId } from '../shared/mapping-engine';
import type { AppSnapshot } from '../shared/types';
import { DriverService } from './driver-service';
import { createInputHost, type InputHost } from './input-host';
import { ProfileStore } from './profile-store';

export class AppController {
  private readonly events = new EventEmitter();
  private readonly driver = new DriverService();
  private pingTimer: NodeJS.Timeout | null = null;
  private driverPollTimer: NodeJS.Timeout | null = null;
  private driverPollAttempts = 0;
  private hostUnsubscribe: (() => void) | null = null;
  private snapshot: AppSnapshot = makeInitialSnapshot();

  constructor(
    private readonly profiles: ProfileStore,
    private readonly host: InputHost = createInputHost(),
  ) {}

  async initialize(): Promise<void> {
    const document = await this.profiles.load();
    this.snapshot = {
      ...makeInitialSnapshot(),
      profiles: document.profiles,
      activeProfileId: document.activeProfileId,
      runtime: {
        ...makeInitialSnapshot().runtime,
        passthrough: document.passthrough,
      },
    };
    this.hostUnsubscribe = this.host.onEvent((event) => void this.onHostEvent(event));
    this.addLog(process.platform === 'win32' ? 'Starting Windows input host.' : 'Starting safe demo input host.');
    await this.host.start(this.profiles.activeProfile(), document.passthrough);
    this.pingTimer = setInterval(() => this.host.ping(Date.now()), 2_000);
    this.publish();
  }

  getSnapshot(): AppSnapshot {
    return structuredClone(this.snapshot);
  }

  subscribe(listener: (snapshot: AppSnapshot) => void): () => void {
    this.events.on('snapshot', listener);
    return () => this.events.off('snapshot', listener);
  }

  get inputHost(): InputHost {
    return this.host;
  }

  async setEnabled(value: boolean): Promise<void> {
    if (value && !['ready', 'demo'].includes(this.snapshot.runtime.helperState)) {
      throw new Error('The input host is not ready. Open Diagnostics for details.');
    }
    this.host.setEnabled(value);
    this.snapshot.runtime.enabled = value;
    if (!value) {
      this.snapshot.controller = createNeutralControllerState(this.snapshot.controller.sequence + 1);
      this.snapshot.pressedKeys = [];
    }
    this.addLog(value ? 'Keyboard mapping enabled.' : 'Keyboard mapping paused.');
    this.publish();
  }

  async setPassthrough(value: boolean): Promise<void> {
    await this.profiles.setPassthrough(value);
    this.host.setPassthrough(value);
    this.snapshot.runtime.passthrough = value;
    this.addLog(value ? 'Mapped keys will pass through.' : 'Mapped keys will be blocked while enabled.');
    this.refreshProfiles();
  }

  async selectProfile(profileId: string): Promise<void> {
    await this.safetyPause('Profile changed');
    await this.profiles.select(profileId);
    this.host.setProfile(this.profiles.activeProfile());
    this.refreshProfiles();
    this.addLog(`Selected profile “${this.profiles.activeProfile().name}”.`);
  }

  async createProfile(name?: string): Promise<MappingProfile> {
    await this.safetyPause('Profile created');
    const profile = await this.profiles.create(name);
    this.host.setProfile(profile);
    this.refreshProfiles();
    this.addLog(`Created profile “${profile.name}”.`);
    return profile;
  }

  async renameProfile(profileId: string, name: string): Promise<void> {
    await this.profiles.renameProfile(profileId, name);
    this.refreshProfiles();
  }

  async duplicateProfile(profileId: string): Promise<MappingProfile> {
    await this.safetyPause('Profile duplicated');
    const profile = await this.profiles.duplicate(profileId);
    this.host.setProfile(profile);
    this.refreshProfiles();
    this.addLog(`Duplicated profile as “${profile.name}”.`);
    return profile;
  }

  async deleteProfile(profileId: string): Promise<void> {
    await this.safetyPause('Profile deleted');
    await this.profiles.delete(profileId);
    this.host.setProfile(this.profiles.activeProfile());
    this.refreshProfiles();
    this.addLog('Deleted profile.');
  }

  async removeBinding(bindingId: string): Promise<void> {
    await this.safetyPause('Binding changed');
    await this.profiles.removeBinding(bindingId);
    this.host.setProfile(this.profiles.activeProfile());
    this.refreshProfiles();
  }

  beginCapture(target: ControllerTarget): void {
    this.snapshot.captureTarget = target;
    this.host.capture(target);
    this.publish();
  }

  cancelCapture(): void {
    this.snapshot.captureTarget = null;
    this.host.cancelCapture();
    this.publish();
  }

  async installDriver(): Promise<void> {
    await this.driver.install();
    this.addLog('Opened the signed ViGEmBus installer. Waiting for the driver to become available.');
    this.publish();
    if (process.platform === 'win32') this.scheduleDriverPoll();
  }

  async openControllerPanel(): Promise<void> {
    await this.driver.openControllerPanel();
  }

  async recheck(): Promise<void> {
    await this.safetyPause('Connection recheck');
    await this.host.stop();
    this.snapshot.runtime.helperState = 'starting';
    this.snapshot.runtime.driverState = process.platform === 'win32' ? 'unknown' : 'unsupported';
    this.snapshot.runtime.lastError = undefined;
    this.publish();
    await this.host.start(this.profiles.activeProfile(), this.snapshot.runtime.passthrough);
  }

  async safetyPause(reason: string): Promise<void> {
    this.host.reset();
    this.host.setEnabled(false);
    this.snapshot.runtime.enabled = false;
    this.snapshot.pressedKeys = [];
    this.snapshot.controller = createNeutralControllerState(this.snapshot.controller.sequence + 1);
    this.addLog(`${reason}; all outputs released.`);
    this.publish();
  }

  async shutdown(): Promise<void> {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.driverPollTimer) clearTimeout(this.driverPollTimer);
    this.driverPollTimer = null;
    this.hostUnsubscribe?.();
    this.hostUnsubscribe = null;
    await this.host.stop();
  }

  private async onHostEvent(event: HostEvent): Promise<void> {
    switch (event.type) {
      case 'ready':
        if (event.protocolVersion !== this.snapshot.runtime.protocolVersion) {
          this.snapshot.runtime.helperState = 'fault';
          this.snapshot.runtime.lastError = 'The input host protocol version does not match the app.';
          break;
        }
        this.snapshot.runtime.helperState = process.platform === 'win32' ? 'ready' : 'demo';
        this.snapshot.runtime.driverState = process.platform === 'win32' ? 'ready' : 'unsupported';
        this.snapshot.runtime.driverVersion = event.driverVersion;
        this.snapshot.runtime.playerIndex = event.playerIndex;
        this.snapshot.runtime.lastError = undefined;
        this.addLog(process.platform === 'win32' ? 'Virtual Xbox controller connected.' : 'Demo controller ready.');
        break;
      case 'key':
        this.updatePressedKeys(event.key, event.down, event.timestamp);
        break;
      case 'capture':
        {
          const keyId = physicalKeyId(event.key);
          const previous = this.profiles
            .activeProfile()
            .bindings.find((binding) => physicalKeyId(binding.source) === keyId);
          await this.safetyPause('Binding changed');
          await this.profiles.bind(event.key, event.target);
          this.snapshot.captureTarget = null;
          this.host.setProfile(this.profiles.activeProfile());
          this.refreshProfiles(false);
          this.addLog(`Bound ${event.key.label} to ${event.target}.`);
          if (previous && previous.target !== event.target) {
            this.snapshot.notice = {
              id: Date.now(),
              message: `${event.key.label} moved from ${previous.target} to ${event.target}.`,
            };
          }
        }
        break;
      case 'controller':
        this.snapshot.controller = event.state;
        break;
      case 'enabled':
        this.snapshot.runtime.enabled = event.value;
        if (!event.value) {
          this.snapshot.controller = createNeutralControllerState(this.snapshot.controller.sequence + 1);
          this.snapshot.pressedKeys = [];
        }
        if (event.reason) this.addLog(`Mapping disabled: ${event.reason}.`);
        break;
      case 'fault':
        this.snapshot.runtime.enabled = false;
        this.snapshot.runtime.helperState = 'fault';
        this.snapshot.runtime.driverState = event.code.includes('DRIVER') ? 'missing' : 'unknown';
        this.snapshot.runtime.lastError = event.message;
        this.snapshot.controller = createNeutralControllerState(this.snapshot.controller.sequence + 1);
        this.addLog(`${event.code}: ${event.message}`);
        break;
      case 'pong':
        this.snapshot.runtime.latencyMs = Math.max(0, Date.now() - event.sentAt);
        break;
      case 'log':
        if (event.level !== 'debug') this.addLog(event.message);
        break;
    }
    this.publish();
  }

  private updatePressedKeys(key: PhysicalKey, down: boolean, timestamp: number): void {
    const id = physicalKeyId(key);
    const profile = this.profiles.activeProfile();
    const mappedTarget = profile.bindings.find((binding) => physicalKeyId(binding.source) === id)?.target;
    this.snapshot.pressedKeys = this.snapshot.pressedKeys.filter((pressed) => physicalKeyId(pressed) !== id);
    if (down) this.snapshot.pressedKeys.unshift({ ...key, pressedAt: timestamp, mappedTarget });
    this.snapshot.pressedKeys = this.snapshot.pressedKeys.slice(0, 24);
  }

  private refreshProfiles(publish = true): void {
    const document = this.profiles.snapshot();
    this.snapshot.profiles = document.profiles;
    this.snapshot.activeProfileId = document.activeProfileId;
    this.snapshot.runtime.passthrough = document.passthrough;
    if (publish) this.publish();
  }

  private addLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.snapshot.logs = [`${timestamp}  ${message}`, ...this.snapshot.logs].slice(0, 100);
  }

  private scheduleDriverPoll(): void {
    if (this.driverPollTimer) clearTimeout(this.driverPollTimer);
    this.driverPollAttempts = 0;
    const poll = async () => {
      this.driverPollAttempts += 1;
      await this.recheck();
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      if (this.snapshot.runtime.driverState === 'ready') {
        this.driverPollTimer = null;
        this.addLog('ViGEmBus connected after installation. Mapping remains paused until you enable it.');
        this.publish();
        return;
      }
      if (this.driverPollAttempts >= 24) {
        this.driverPollTimer = null;
        this.addLog('Driver setup was not detected. Restart Windows or use the official installer repair option.');
        this.publish();
        return;
      }
      this.driverPollTimer = setTimeout(() => void poll(), 3_500);
    };
    this.driverPollTimer = setTimeout(() => void poll(), 4_000);
  }

  private publish(): void {
    this.snapshot.diagnostics = buildDiagnostics(this.snapshot);
    this.events.emit('snapshot', this.getSnapshot());
  }
}

function buildDiagnostics(snapshot: AppSnapshot): DiagnosticResult[] {
  const isWindows = snapshot.runtime.platform === 'win32';
  return [
    {
      id: 'platform',
      label: 'Platform',
      status: isWindows ? 'pass' : 'info',
      detail: isWindows ? 'Windows 10/11 x64 output is supported.' : 'UI demo mode — virtual output requires Windows 10/11.',
    },
    {
      id: 'helper',
      label: 'Input host',
      status: ['ready', 'demo'].includes(snapshot.runtime.helperState) ? 'pass' : snapshot.runtime.helperState === 'fault' ? 'fail' : 'warn',
      detail: snapshot.runtime.lastError ?? `Host state: ${snapshot.runtime.helperState}.`,
      action: snapshot.runtime.helperState === 'fault' ? 'recheck' : undefined,
    },
    {
      id: 'driver',
      label: 'Virtual controller driver',
      status: !isWindows ? 'info' : snapshot.runtime.driverState === 'ready' ? 'pass' : 'fail',
      detail: !isWindows
        ? 'Not loaded in demo mode.'
        : snapshot.runtime.driverState === 'ready'
          ? `ViGEmBus ${snapshot.runtime.driverVersion ?? 'detected'}.`
          : 'ViGEmBus is missing or could not be reached.',
      action: isWindows && snapshot.runtime.driverState !== 'ready' ? 'install-driver' : undefined,
    },
    {
      id: 'controller',
      label: 'XInput controller',
      status: snapshot.runtime.playerIndex === null ? 'warn' : 'pass',
      detail:
        snapshot.runtime.playerIndex === null
          ? 'No player slot has been assigned yet.'
          : `${isWindows ? 'XInput' : 'Demo'} player ${snapshot.runtime.playerIndex + 1} is connected.`,
      action: isWindows ? 'open-controller-panel' : undefined,
    },
    {
      id: 'keyboard-hook',
      label: 'Keyboard safety',
      status: snapshot.runtime.enabled ? 'pass' : 'info',
      detail: snapshot.runtime.enabled
        ? snapshot.runtime.passthrough
          ? 'Mappings are live; keyboard events also pass through.'
          : 'Mappings are live; mapped keys are blocked. Ctrl+Alt+F12 always disables.'
        : 'Mapping is paused; the keyboard is never blocked.',
    },
    {
      id: 'steam',
      label: 'Game compatibility',
      status: 'info',
      detail: 'If a game double-inputs, disable Steam Input for that title. Elevated or anti-cheat games may block hooks.',
    },
  ];
}
