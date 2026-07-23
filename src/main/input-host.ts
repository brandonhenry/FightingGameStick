import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { app } from 'electron';
import { MappingEngine } from '../shared/mapping-engine';
import { hostEventSchema } from '../shared/schemas';
import {
  PROTOCOL_VERSION,
  type ControllerTarget,
  type HostCommand,
  type HostEvent,
  type MappingProfile,
  type PhysicalKey,
} from '../shared/types';

export abstract class InputHost {
  protected readonly emitter = new EventEmitter();

  onEvent(listener: (event: HostEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  protected emit(event: HostEvent): void {
    this.emitter.emit('event', event);
  }

  abstract start(profile: MappingProfile, passthrough: boolean): Promise<void>;
  abstract stop(): Promise<void>;
  abstract setProfile(profile: MappingProfile): void;
  abstract setEnabled(value: boolean): void;
  abstract setPassthrough(value: boolean): void;
  abstract capture(target: ControllerTarget): void;
  abstract cancelCapture(): void;
  abstract reset(): void;
  abstract ping(sentAt: number): void;
}

export class WindowsInputHost extends InputHost {
  private child: ChildProcessWithoutNullStreams | null = null;
  private stopping = false;
  private buffer = '';

  async start(profile: MappingProfile, passthrough: boolean): Promise<void> {
    if (this.child) return;
    const executable = this.resolveExecutable();
    if (!existsSync(executable)) {
      this.emit({
        type: 'fault',
        code: 'HOST_MISSING',
        message: `Windows input host was not found at ${executable}`,
        recoverable: false,
      });
      return;
    }

    this.stopping = false;
    const child = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.readLines(chunk));
    child.stderr.on('data', (chunk: string) => {
      const message = chunk.trim();
      if (message) this.emit({ type: 'log', level: 'warn', message: `Input host: ${message}` });
    });
    child.on('error', (error) => {
      this.emit({ type: 'fault', code: 'HOST_START_FAILED', message: error.message, recoverable: true });
    });
    child.on('exit', (code) => {
      this.child = null;
      if (!this.stopping) {
        this.emit({
          type: 'fault',
          code: 'HOST_EXITED',
          message: `Input host exited unexpectedly${code === null ? '' : ` with code ${code}`}.`,
          recoverable: true,
        });
      }
    });
    this.send({ type: 'initialize', protocolVersion: PROTOCOL_VERSION, profile, passthrough });
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    this.send({ type: 'shutdown' });
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve();
      }, 1_500);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    this.child = null;
  }

  setProfile(profile: MappingProfile): void {
    this.send({ type: 'configure', profile });
  }

  setEnabled(value: boolean): void {
    this.send({ type: 'enable', value });
  }

  setPassthrough(value: boolean): void {
    this.send({ type: 'passthrough', value });
  }

  capture(target: ControllerTarget): void {
    this.send({ type: 'capture', target });
  }

  cancelCapture(): void {
    this.send({ type: 'cancel-capture' });
  }

  reset(): void {
    this.send({ type: 'reset' });
  }

  ping(sentAt: number): void {
    this.send({ type: 'ping', sentAt });
  }

  private send(command: HostCommand): void {
    if (!this.child?.stdin.writable) return;
    this.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  private readLines(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        try {
          this.emit(hostEventSchema.parse(JSON.parse(line)) as HostEvent);
        } catch (error) {
          this.emit({
            type: 'log',
            level: 'warn',
            message: `Ignored invalid input-host message: ${(error as Error).message}`,
          });
        }
      }
      newline = this.buffer.indexOf('\n');
    }
  }

  private resolveExecutable(): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'FightingGameStick.InputHost.exe')
      : path.resolve('resources/input-host/win-x64/FightingGameStick.InputHost.exe');
  }
}

export interface DemoKeyboardInput {
  type: 'keyDown' | 'keyUp';
  key: string;
  code: string;
  control: boolean;
  alt: boolean;
  isAutoRepeat: boolean;
}

export class DemoInputHost extends InputHost {
  private engine: MappingEngine | null = null;
  private enabled = false;
  private passthrough = false;
  private captureTarget: ControllerTarget | null = null;

  async start(profile: MappingProfile, passthrough: boolean): Promise<void> {
    this.engine = new MappingEngine(profile);
    this.passthrough = passthrough;
    queueMicrotask(() => {
      this.emit({ type: 'ready', protocolVersion: PROTOCOL_VERSION, playerIndex: 0, driverVersion: 'Demo' });
      this.emit({ type: 'controller', state: this.engine!.getState() });
    });
  }

  async stop(): Promise<void> {
    this.enabled = false;
    this.engine = null;
  }

  setProfile(profile: MappingProfile): void {
    if (!this.engine) return;
    this.enabled = false;
    this.emit({ type: 'enabled', value: false, reason: 'Profile changed' });
    this.emit({ type: 'controller', state: this.engine.configure(profile) });
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    this.emit({ type: 'enabled', value });
    if (!value && this.engine) this.emit({ type: 'controller', state: this.engine.reset() });
  }

  setPassthrough(value: boolean): void {
    this.passthrough = value;
  }

  capture(target: ControllerTarget): void {
    this.captureTarget = target;
  }

  cancelCapture(): void {
    this.captureTarget = null;
  }

  reset(): void {
    if (this.engine) this.emit({ type: 'controller', state: this.engine.reset() });
  }

  ping(sentAt: number): void {
    this.emit({ type: 'pong', sentAt, receivedAt: Date.now() });
  }

  handleInput(input: DemoKeyboardInput): boolean {
    if (!this.engine) return false;
    const key = demoPhysicalKey(input.code, input.key);
    const down = input.type === 'keyDown';

    if (down && input.control && input.alt && input.code === 'F12') {
      this.enabled = false;
      this.emit({ type: 'enabled', value: false, reason: 'Emergency shortcut' });
      this.emit({ type: 'controller', state: this.engine.reset() });
      return true;
    }

    if (down && this.captureTarget && !input.isAutoRepeat) {
      const target = this.captureTarget;
      this.captureTarget = null;
      this.emit({ type: 'capture', key, target });
      return true;
    }

    this.emit({ type: 'key', key, down, timestamp: Date.now() });
    if (this.enabled) {
      const state = this.engine.transition(key, down);
      if (state) this.emit({ type: 'controller', state });
    }
    return this.enabled && !this.passthrough && this.engine.isMapped(key);
  }
}

const codeToScanCode: Record<string, number> = {
  Escape: 0x01,
  Digit1: 0x02,
  Digit2: 0x03,
  Digit3: 0x04,
  Digit4: 0x05,
  Digit5: 0x06,
  Digit6: 0x07,
  Digit7: 0x08,
  Digit8: 0x09,
  Digit9: 0x0a,
  Digit0: 0x0b,
  Minus: 0x0c,
  Equal: 0x0d,
  Backspace: 0x0e,
  Tab: 0x0f,
  KeyQ: 0x10,
  KeyW: 0x11,
  KeyE: 0x12,
  KeyR: 0x13,
  KeyT: 0x14,
  KeyY: 0x15,
  KeyU: 0x16,
  KeyI: 0x17,
  KeyO: 0x18,
  KeyP: 0x19,
  BracketLeft: 0x1a,
  BracketRight: 0x1b,
  Enter: 0x1c,
  ControlLeft: 0x1d,
  KeyA: 0x1e,
  KeyS: 0x1f,
  KeyD: 0x20,
  KeyF: 0x21,
  KeyG: 0x22,
  KeyH: 0x23,
  KeyJ: 0x24,
  KeyK: 0x25,
  KeyL: 0x26,
  Semicolon: 0x27,
  Quote: 0x28,
  Backquote: 0x29,
  ShiftLeft: 0x2a,
  Backslash: 0x2b,
  KeyZ: 0x2c,
  KeyX: 0x2d,
  KeyC: 0x2e,
  KeyV: 0x2f,
  KeyB: 0x30,
  KeyN: 0x31,
  KeyM: 0x32,
  Comma: 0x33,
  Period: 0x34,
  Slash: 0x35,
  ShiftRight: 0x36,
  AltLeft: 0x38,
  Space: 0x39,
  CapsLock: 0x3a,
  F1: 0x3b,
  F2: 0x3c,
  F3: 0x3d,
  F4: 0x3e,
  F5: 0x3f,
  F6: 0x40,
  F7: 0x41,
  F8: 0x42,
  F9: 0x43,
  F10: 0x44,
  F11: 0x57,
  F12: 0x58,
  ArrowUp: 0x48,
  ArrowLeft: 0x4b,
  ArrowRight: 0x4d,
  ArrowDown: 0x50,
  ControlRight: 0x1d,
  AltRight: 0x38,
};

function demoPhysicalKey(code: string, label: string): PhysicalKey {
  const normalizedLabel = label.length === 1 ? label.toLocaleUpperCase() : label;
  const extended = code.startsWith('Arrow') || code.endsWith('Right');
  const fallback = [...code].reduce((sum, character) => (sum + character.charCodeAt(0)) & 0xffff, 0);
  const virtualKey = normalizedLabel.length === 1 ? normalizedLabel.charCodeAt(0) : fallback;
  return {
    scanCode: codeToScanCode[code] ?? fallback,
    virtualKey,
    extended,
    label: normalizedLabel || code,
  };
}

export function createInputHost(): InputHost {
  return process.platform === 'win32' ? new WindowsInputHost() : new DemoInputHost();
}
