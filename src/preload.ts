import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './shared/ipc';
import type { AppBridge, AppSnapshot, ControllerTarget } from './shared/types';

const bridge: AppBridge = {
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
  setEnabled: (value) => ipcRenderer.invoke(IPC.setEnabled, value),
  setPassthrough: (value) => ipcRenderer.invoke(IPC.setPassthrough, value),
  selectProfile: (profileId) => ipcRenderer.invoke(IPC.selectProfile, profileId),
  createProfile: (name) => ipcRenderer.invoke(IPC.createProfile, name),
  renameProfile: (profileId, name) => ipcRenderer.invoke(IPC.renameProfile, profileId, name),
  duplicateProfile: (profileId) => ipcRenderer.invoke(IPC.duplicateProfile, profileId),
  deleteProfile: (profileId) => ipcRenderer.invoke(IPC.deleteProfile, profileId),
  removeBinding: (bindingId) => ipcRenderer.invoke(IPC.removeBinding, bindingId),
  beginCapture: (target: ControllerTarget) => ipcRenderer.invoke(IPC.beginCapture, target),
  cancelCapture: () => ipcRenderer.invoke(IPC.cancelCapture),
  installDriver: () => ipcRenderer.invoke(IPC.installDriver),
  recheck: () => ipcRenderer.invoke(IPC.recheck),
  openControllerPanel: () => ipcRenderer.invoke(IPC.openControllerPanel),
  onSnapshot: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on(IPC.snapshot, listener);
    return () => ipcRenderer.removeListener(IPC.snapshot, listener);
  },
};

contextBridge.exposeInMainWorld('fightingGameStick', bridge);
