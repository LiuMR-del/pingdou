import Dexie, { type Table } from 'dexie';
import type { Project } from '../model';
import { validateProject } from '../export';

interface StoredProject {
  key: 'draft' | 'recovery';
  project: Project;
  savedAt: string;
}

class ProjectDatabase extends Dexie {
  projects!: Table<StoredProject, string>;

  constructor() {
    super('pixelbeads-projects');
    this.version(1).stores({ projects: '&key' });
  }
}

const database = new ProjectDatabase();

function validatedCopy(project: Project): Project {
  return validateProject(JSON.parse(JSON.stringify(project)));
}

async function save(key: StoredProject['key'], project: Project): Promise<void> {
  const checked = validatedCopy(project);
  await database.projects.put({ key, project: checked, savedAt: new Date().toISOString() });
}

async function load(key: StoredProject['key']): Promise<Project | null> {
  const stored = await database.projects.get(key);
  if (!stored) return null;
  try {
    return validatedCopy(stored.project);
  } catch (error) {
    await database.projects.delete(key);
    throw error;
  }
}

export function saveDraft(project: Project): Promise<void> { return save('draft', project); }
export function loadDraft(): Promise<Project | null> { return load('draft'); }
export function saveRecovery(project: Project): Promise<void> { return save('recovery', project); }
export function loadRecovery(): Promise<Project | null> { return load('recovery'); }
export function clearDraft(): Promise<void> { return database.projects.delete('draft'); }
