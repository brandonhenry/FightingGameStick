import type { AppBridge } from '../shared/types';

declare module '*.png' {
  const source: string;
  export default source;
}

declare global {
  interface Window {
    fightingGameStick: AppBridge;
  }
}

export {};
