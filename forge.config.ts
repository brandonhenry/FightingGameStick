import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const extraResourceCandidates = [
  path.resolve('assets/icons/tray.png'),
  ...(process.platform === 'win32'
    ? [
        path.resolve('resources/input-host/win-x64/FightingGameStick.InputHost.exe'),
        path.resolve('resources/driver/ViGEmBus_1.22.0_x64_x86_arm64.exe'),
      ]
    : []),
].filter(existsSync);

const appIcon = path.resolve(process.platform === 'win32' ? 'assets/icons/app.ico' : 'assets/icons/app.icns');

const windowsSign = process.env.WINDOWS_CERTIFICATE_FILE
  ? {
      certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
      certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
      description: 'Fighting Game Stick',
    }
  : undefined;

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'FightingGameStick',
    icon: appIcon,
    extraResource: extraResourceCandidates,
    ...(windowsSign ? { windowsSign } : {}),
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'FightingGameStick',
      setupExe: 'FightingGameStickSetup.exe',
      setupIcon: path.resolve('assets/icons/app.ico'),
      ...(windowsSign ? { windowsSign } : {}),
    }),
    new MakerZIP({}, ['win32', 'darwin']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};

export default config;
