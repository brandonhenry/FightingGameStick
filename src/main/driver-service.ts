import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { app, shell } from 'electron';

const DRIVER_DOWNLOAD_URL =
  'https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/ViGEmBus_1.22.0_x64_x86_arm64.exe';

export class DriverService {
  async install(): Promise<void> {
    if (process.platform !== 'win32') {
      await shell.openExternal(DRIVER_DOWNLOAD_URL);
      return;
    }
    const installer = app.isPackaged
      ? path.join(process.resourcesPath, 'ViGEmBus_1.22.0_x64_x86_arm64.exe')
      : path.resolve('resources/driver/ViGEmBus_1.22.0_x64_x86_arm64.exe');

    if (!existsSync(installer)) {
      await shell.openExternal(DRIVER_DOWNLOAD_URL);
      return;
    }
    const child = spawn(installer, [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
  }

  async openControllerPanel(): Promise<void> {
    if (process.platform !== 'win32') return;
    const child = spawn('control.exe', ['joy.cpl'], { detached: true, stdio: 'ignore' });
    child.unref();
  }
}
