import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { z } from 'zod';
import { bindingTargetSchema } from '../shared/schemas';
import { IPC } from '../shared/ipc';
import type { AppController } from './app-controller';

export function registerIpcHandlers(controller: AppController, getWindow: () => BrowserWindow | null): void {
  const trusted = (event: IpcMainInvokeEvent) => {
    const window = getWindow();
    if (!window || event.sender.id !== window.webContents.id) throw new Error('Untrusted IPC sender.');
  };

  ipcMain.handle(IPC.getSnapshot, (event) => {
    trusted(event);
    return controller.getSnapshot();
  });
  ipcMain.handle(IPC.setEnabled, async (event, value: unknown) => {
    trusted(event);
    await controller.setEnabled(z.boolean().parse(value));
  });
  ipcMain.handle(IPC.setPassthrough, async (event, value: unknown) => {
    trusted(event);
    await controller.setPassthrough(z.boolean().parse(value));
  });
  ipcMain.handle(IPC.setMouseEnabled, async (event, value: unknown) => {
    trusted(event);
    await controller.setMouseEnabled(z.boolean().parse(value));
  });
  ipcMain.handle(IPC.selectProfile, async (event, profileId: unknown) => {
    trusted(event);
    await controller.selectProfile(z.string().min(1).max(128).parse(profileId));
  });
  ipcMain.handle(IPC.createProfile, async (event, name: unknown) => {
    trusted(event);
    return controller.createProfile(z.string().trim().min(1).max(48).optional().parse(name));
  });
  ipcMain.handle(IPC.renameProfile, async (event, profileId: unknown, name: unknown) => {
    trusted(event);
    await controller.renameProfile(
      z.string().min(1).max(128).parse(profileId),
      z.string().trim().min(1).max(48).parse(name),
    );
  });
  ipcMain.handle(IPC.duplicateProfile, async (event, profileId: unknown) => {
    trusted(event);
    return controller.duplicateProfile(z.string().min(1).max(128).parse(profileId));
  });
  ipcMain.handle(IPC.deleteProfile, async (event, profileId: unknown) => {
    trusted(event);
    await controller.deleteProfile(z.string().min(1).max(128).parse(profileId));
  });
  ipcMain.handle(IPC.removeBinding, async (event, bindingId: unknown) => {
    trusted(event);
    await controller.removeBinding(z.string().min(1).max(128).parse(bindingId));
  });
  ipcMain.handle(IPC.beginCapture, async (event, target: unknown) => {
    trusted(event);
    controller.beginCapture(bindingTargetSchema.parse(target));
  });
  ipcMain.handle(IPC.cancelCapture, async (event) => {
    trusted(event);
    controller.cancelCapture();
  });
  ipcMain.handle(IPC.installDriver, async (event) => {
    trusted(event);
    await controller.installDriver();
  });
  ipcMain.handle(IPC.recheck, async (event) => {
    trusted(event);
    await controller.recheck();
  });
  ipcMain.handle(IPC.openControllerPanel, async (event) => {
    trusted(event);
    await controller.openControllerPanel();
  });
}
