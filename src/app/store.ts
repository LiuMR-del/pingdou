import { create } from "zustand";
import {
  defaultSettings,
  type Project,
  type Settings,
  type SourceImage,
  type Pattern,
  type CellChange,
  type RegionConstraints,
} from "../model";
interface State {
  project: Project;
  undoStack: CellChange[][];
  redoStack: CellChange[][];
  setSource(source: SourceImage): void;
  updateSettings(settings: Partial<Settings>): void;
  setPattern(pattern: Pattern, constraints?: RegionConstraints): void;
  setConstraints(constraints: RegionConstraints): void;
  undoConstraints(): void;
  constraintHistory: (RegionConstraints | undefined)[];
  setProject(project: Project): void;
  commit(changes: CellChange[]): void;
  undo(): void;
  redo(): void;
}
function initial(): Project {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title: "未命名作品",
    source: null,
    settings: { ...defaultSettings },
    pattern: null,
    edited: false,
    updatedAt: new Date().toISOString(),
  };
}
function touch(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}
function apply(
  project: Project,
  changes: CellChange[],
  backwards = false,
): Project {
  if (!project.pattern) return project;
  const cells = [...project.pattern.cells];
  for (const c of changes) cells[c.index] = backwards ? c.before : c.after;
  return touch({
    ...project,
    pattern: { ...project.pattern, cells },
    edited: true,
  });
}
export const useStudio = create<State>((set) => ({
  project: initial(),
  undoStack: [],
  redoStack: [],
  constraintHistory: [],
  setSource: (source) =>
    set({
      project: { ...initial(), source, title: source.name },
      undoStack: [],
      redoStack: [],
      constraintHistory: [],
    }),
  updateSettings: (settings) =>
    set((s) => ({
      project: touch({
        ...s.project,
        settings: { ...s.project.settings, ...settings },
      }),
    })),
  setPattern: (pattern, constraints) =>
    set((s) => ({
      project: touch({
        ...s.project,
        pattern,
        constraints,
        generatedConstraints: constraints
          ? structuredClone(constraints)
          : undefined,
        edited: false,
      }),
      undoStack: [],
      redoStack: [],
      constraintHistory: [],
    })),
  setConstraints: (constraints) =>
    set((s) => ({
      project: touch({ ...s.project, constraints }),
      constraintHistory: [
        ...s.constraintHistory.slice(-19),
        s.project.constraints
          ? structuredClone(s.project.constraints)
          : undefined,
      ],
    })),
  undoConstraints: () =>
    set((s) =>
      s.constraintHistory.length
        ? {
            project: touch({
              ...s.project,
              constraints: s.constraintHistory.at(-1),
            }),
            constraintHistory: s.constraintHistory.slice(0, -1),
          }
        : {},
    ),
  setProject: (project) =>
    set({ project, undoStack: [], redoStack: [], constraintHistory: [] }),
  commit: (changes) =>
    set((s) =>
      changes.length
        ? {
            project: apply(s.project, changes),
            undoStack: [...s.undoStack.slice(-49), changes],
            redoStack: [],
          }
        : {},
    ),
  undo: () =>
    set((s) => {
      const changes = s.undoStack.at(-1);
      return changes
        ? {
            project: apply(s.project, changes, true),
            undoStack: s.undoStack.slice(0, -1),
            redoStack: [...s.redoStack, changes],
          }
        : {};
    }),
  redo: () =>
    set((s) => {
      const changes = s.redoStack.at(-1);
      return changes
        ? {
            project: apply(s.project, changes),
            redoStack: s.redoStack.slice(0, -1),
            undoStack: [...s.undoStack, changes],
          }
        : {};
    }),
}));
