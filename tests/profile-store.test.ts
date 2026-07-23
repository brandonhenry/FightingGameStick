import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfileStore } from '../src/main/profile-store';
import { makeDefaultStore } from '../src/shared/defaults';
import { profileStoreSchema } from '../src/shared/schemas';

const directories: string[] = [];

async function createStore(): Promise<{ store: ProfileStore; file: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fighting-game-stick-'));
  directories.push(directory);
  const file = path.join(directory, 'profiles.json');
  const result = new ProfileStore(file);
  await result.load();
  return { store: result, file };
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises');
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('ProfileStore', () => {
  it('persists a schema-valid default document atomically', async () => {
    const { file } = await createStore();
    const document = JSON.parse(await readFile(file, 'utf8'));
    expect(profileStoreSchema.safeParse(document).success).toBe(true);
    expect(document.profiles[0].bindings).toHaveLength(14);
    expect(document.profiles[0].bindings.find((binding: { target: string }) => binding.target === 'start')?.source.label).toBe('Escape');
    expect(document.passthrough).toBe(false);
  });

  it('migrates an untouched legacy fight layout from Enter to Escape', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'fighting-game-stick-legacy-'));
    directories.push(directory);
    const file = path.join(directory, 'profiles.json');
    const legacy = makeDefaultStore();
    const start = legacy.profiles[0]!.bindings.find((binding) => binding.target === 'start')!;
    start.source = { scanCode: 0x1c, virtualKey: 0x0d, extended: false, label: 'Enter' };
    await writeFile(file, JSON.stringify(legacy));

    const store = new ProfileStore(file);
    await store.load();

    expect(store.activeProfile().bindings.find((binding) => binding.target === 'start')?.source.label).toBe('Escape');
  });

  it('moves a source key when it is rebound and allows shared outputs', async () => {
    const { store } = await createStore();
    const source = { scanCode: 30, virtualKey: 65, extended: false, label: 'A' };
    await store.bind(source, 'x');
    await store.bind(source, 'y');
    const active = store.activeProfile();
    expect(active.bindings.filter((item) => item.source.scanCode === 30)).toHaveLength(1);
    expect(active.bindings.find((item) => item.source.scanCode === 30)?.target).toBe('y');

    await store.bind({ scanCode: 31, virtualKey: 83, extended: false, label: 'S' }, 'y');
    const shared = store.activeProfile().bindings.filter((item) => item.target === 'y');
    expect(shared.some((item) => item.source.scanCode === 30)).toBe(true);
    expect(shared.some((item) => item.source.scanCode === 31)).toBe(true);
  });

  it('persists a motion shortcut and moves the source from its previous binding', async () => {
    const { store } = await createStore();
    const source = { scanCode: 16, virtualKey: 81, extended: false, label: 'Q' };
    await store.bind(source, 'a');
    await store.bind(source, 'qcf-a');
    const matches = store.activeProfile().bindings.filter((binding) => binding.source.scanCode === 16);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.target).toBe('qcf-a');
  });

  it('recovers from malformed data and keeps a usable profile', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'fighting-game-stick-broken-'));
    directories.push(directory);
    const file = path.join(directory, 'profiles.json');
    await writeFile(file, '{not-json');
    const result = new ProfileStore(file);
    const document = await result.load();
    expect(document.profiles).toHaveLength(1);
    expect(profileStoreSchema.safeParse(document).success).toBe(true);
  });

  it('supports create, rename, duplicate, switch, and delete', async () => {
    const { store } = await createStore();
    const original = store.activeProfile();
    const created = await store.create('Keyboard two');
    await store.renameProfile(created.id, 'Keyboard alternate');
    const duplicate = await store.duplicate(original.id);
    await store.select(created.id);
    await store.delete(duplicate.id);
    expect(store.activeProfile().name).toBe('Keyboard alternate');
    expect(store.snapshot().profiles).toHaveLength(2);
  });
});
