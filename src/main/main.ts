import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { app, BrowserWindow, Menu, nativeImage, powerMonitor, protocol, Tray } from 'electron';
import { AppController } from './app-controller';
import { DemoInputHost } from './input-host';
import { registerIpcHandlers } from './ipc-handlers';
import { ProfileStore } from './profile-store';
import { IPC } from '../shared/ipc';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let controller: AppController | null = null;
let quitting = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'fighting-stick',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

app.on('second-instance', () => showMainWindow());

app.whenReady().then(async () => {
  app.setAppUserModelId('com.fightinggamestick.app');
  Menu.setApplicationMenu(null);
  registerRendererProtocol();

  controller = new AppController(new ProfileStore(path.join(app.getPath('userData'), 'profiles.json')));
  await controller.initialize();
  createMainWindow();
  createTray();
  registerIpcHandlers(controller, () => mainWindow);

  controller.subscribe((snapshot) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.snapshot, snapshot);
    refreshTrayMenu();
  });

  powerMonitor.on('suspend', () => void controller?.safetyPause('System suspended'));
  powerMonitor.on('lock-screen', () => void controller?.safetyPause('Session locked'));
  powerMonitor.on('resume', () => void controller?.recheck());
  powerMonitor.on('unlock-screen', () => void controller?.recheck());
});

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  showMainWindow();
});

app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void controller?.shutdown().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !controller?.getSnapshot().runtime.enabled) app.quit();
});

function createMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) return;
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#090d12',
    icon: app.isPackaged ? path.join(process.resourcesPath, 'tray.png') : path.resolve('assets/icons/app.png'),
    show: false,
    title: 'Fighting Game Stick',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const rendererUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL ?? 'fighting-stick://renderer/index.html';
  const allowedOrigin = new URL(rendererUrl).origin;

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const target = new URL(targetUrl);
    const allowed =
      MAIN_WINDOW_VITE_DEV_SERVER_URL !== undefined
        ? target.origin === allowedOrigin
        : target.origin === allowedOrigin && target.pathname === '/index.html';
    if (!allowed) event.preventDefault();
  });

  void mainWindow.loadURL(rendererUrl);

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('render-process-gone', () => void controller?.safetyPause('Renderer stopped'));
  mainWindow.on('unresponsive', () => void controller?.safetyPause('Window became unresponsive'));
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const host = controller?.inputHost;
    if (!(host instanceof DemoInputHost)) return;
    const suppress = host.handleInput({
      type: input.type === 'keyUp' ? 'keyUp' : 'keyDown',
      key: input.key,
      code: input.code,
      control: input.control,
      alt: input.alt,
      isAutoRepeat: input.isAutoRepeat,
    });
    if (suppress) event.preventDefault();
  });
  mainWindow.on('close', (event) => {
    if (quitting) return;
    if (controller?.getSnapshot().runtime.enabled) {
      event.preventDefault();
      mainWindow?.hide();
    } else if (process.platform !== 'darwin') {
      quitting = true;
      void controller?.shutdown().finally(() => app.quit());
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerRendererProtocol(): void {
  if (!app.isPackaged) return;
  const rendererRoot = path.resolve(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };

  void protocol.handle('fighting-stick', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'renderer') return new Response('Not found', { status: 404 });

    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const filePath = path.resolve(rendererRoot, relativePath);
    if (filePath !== rendererRoot && !filePath.startsWith(`${rendererRoot}${path.sep}`)) {
      return new Response('Not found', { status: 404 });
    }

    try {
      const body = await readFile(filePath);
      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createTray(): void {
  const trayIcon = app.isPackaged ? path.join(process.resourcesPath, 'tray.png') : path.resolve('assets/icons/tray.png');
  const image = nativeImage.createFromPath(trayIcon);
  tray = new Tray(image.resize({ width: 18, height: 18 }));
  tray.setToolTip('Fighting Game Stick');
  tray.on('double-click', () => showMainWindow());
  refreshTrayMenu();
}

function refreshTrayMenu(): void {
  if (!tray || !controller) return;
  const enabled = controller.getSnapshot().runtime.enabled;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Fighting Game Stick', click: () => showMainWindow() },
      { type: 'separator' },
      {
        label: enabled ? 'Pause keyboard mapping' : 'Enable keyboard mapping',
        click: () => void controller?.setEnabled(!enabled),
      },
      { label: 'Emergency disable', enabled, click: () => void controller?.safetyPause('Tray emergency disable') },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true;
          void controller?.shutdown().finally(() => app.quit());
        },
      },
    ]),
  );
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
}
