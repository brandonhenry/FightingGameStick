import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeDefaultStore } from '../shared/defaults';
import { physicalKeyId } from '../shared/mapping-engine';
import { profileStoreSchema } from '../shared/schemas';
import type { MappingProfile, PhysicalKey, ProfileStoreDocument } from '../shared/types';

export class ProfileStore {
  private document: ProfileStoreDocument = makeDefaultStore();

  constructor(private readonly filePath: string) {}

  async load(): Promise<ProfileStoreDocument> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.document = profileStoreSchema.parse(JSON.parse(raw));
      if (!this.document.profiles.some((profile) => profile.id === this.document.activeProfileId)) {
        this.document.activeProfileId = this.document.profiles[0]!.id;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const backupPath = `${this.filePath}.invalid-${Date.now()}`;
        try {
          await rename(this.filePath, backupPath);
        } catch {
          // The default document remains usable even if the corrupt file cannot be moved.
        }
      }
      this.document = makeDefaultStore();
      await this.save();
    }
    return this.snapshot();
  }

  snapshot(): ProfileStoreDocument {
    return structuredClone(this.document);
  }

  activeProfile(): MappingProfile {
    return structuredClone(
      this.document.profiles.find((profile) => profile.id === this.document.activeProfileId) ??
        this.document.profiles[0]!,
    );
  }

  async select(profileId: string): Promise<void> {
    this.assertProfile(profileId);
    this.document.activeProfileId = profileId;
    await this.save();
  }

  async create(name = 'New profile'): Promise<MappingProfile> {
    const now = new Date().toISOString();
    const profile: MappingProfile = {
      id: randomUUID(),
      name: this.uniqueName(name),
      schemaVersion: 1,
      bindings: [],
      createdAt: now,
      updatedAt: now,
    };
    this.document.profiles.push(profile);
    this.document.activeProfileId = profile.id;
    await this.save();
    return structuredClone(profile);
  }

  async renameProfile(profileId: string, name: string): Promise<void> {
    const profile = this.assertProfile(profileId);
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Profile name cannot be empty.');
    profile.name = trimmed.slice(0, 48);
    profile.updatedAt = new Date().toISOString();
    await this.save();
  }

  async duplicate(profileId: string): Promise<MappingProfile> {
    const source = this.assertProfile(profileId);
    const now = new Date().toISOString();
    const duplicate: MappingProfile = {
      ...structuredClone(source),
      id: randomUUID(),
      name: this.uniqueName(`${source.name} copy`),
      createdAt: now,
      updatedAt: now,
      bindings: source.bindings.map((binding) => ({ ...structuredClone(binding), id: randomUUID() })),
    };
    this.document.profiles.push(duplicate);
    this.document.activeProfileId = duplicate.id;
    await this.save();
    return structuredClone(duplicate);
  }

  async delete(profileId: string): Promise<void> {
    if (this.document.profiles.length === 1) throw new Error('At least one profile is required.');
    const index = this.document.profiles.findIndex((profile) => profile.id === profileId);
    if (index < 0) throw new Error('Profile not found.');
    this.document.profiles.splice(index, 1);
    if (this.document.activeProfileId === profileId) {
      this.document.activeProfileId = this.document.profiles[Math.max(0, index - 1)]!.id;
    }
    await this.save();
  }

  async bind(key: PhysicalKey, target: MappingProfile['bindings'][number]['target']): Promise<void> {
    const profile = this.assertProfile(this.document.activeProfileId);
    const id = physicalKeyId(key);
    profile.bindings = profile.bindings.filter((binding) => physicalKeyId(binding.source) !== id);
    profile.bindings.push({ id: randomUUID(), source: key, target });
    profile.updatedAt = new Date().toISOString();
    await this.save();
  }

  async removeBinding(bindingId: string): Promise<void> {
    const profile = this.assertProfile(this.document.activeProfileId);
    const next = profile.bindings.filter((binding) => binding.id !== bindingId);
    if (next.length === profile.bindings.length) return;
    profile.bindings = next;
    profile.updatedAt = new Date().toISOString();
    await this.save();
  }

  async setPassthrough(value: boolean): Promise<void> {
    this.document.passthrough = value;
    await this.save();
  }

  private assertProfile(profileId: string): MappingProfile {
    const profile = this.document.profiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('Profile not found.');
    return profile;
  }

  private uniqueName(base: string): string {
    const names = new Set(this.document.profiles.map((profile) => profile.name.toLocaleLowerCase()));
    let candidate = base.trim().slice(0, 48) || 'New profile';
    let counter = 2;
    while (names.has(candidate.toLocaleLowerCase())) {
      const suffix = ` ${counter++}`;
      candidate = `${base.slice(0, 48 - suffix.length)}${suffix}`;
    }
    return candidate;
  }

  private async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.document, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
