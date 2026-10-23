import { it, expect, beforeEach } from "vitest";
import { useStudio } from "../src/app/store";
import { defaultPalette } from "../src/palettes";
import {
  defaultSettings,
  geometryKey,
  type Project,
  type RegionConstraints,
} from "../src/model";
const project = (): Project => ({
  schemaVersion: 1,
  id: "store",
  title: "store",
  source: null,
  settings: { ...defaultSettings },
  pattern: {
    width: 2,
    height: 2,
    cells: [0, 1, 2, 3],
    palette: defaultPalette,
    settings: { ...defaultSettings },
    algorithmVersion: "v1",
    durationMs: 0,
  },
  edited: false,
  updatedAt: new Date().toISOString(),
});
beforeEach(() => useStudio.getState().setProject(project()));
it("local edits update cells and undo restores them", () => {
  const s = useStudio.getState();
  s.commit([{ index: 1, before: 1, after: 0 }]);
  expect(useStudio.getState().project.pattern!.cells).toEqual([0, 0, 2, 3]);
  s.undo();
  expect(useStudio.getState().project.pattern!.cells).toEqual([0, 1, 2, 3]);
  s.redo();
  expect(useStudio.getState().project.pattern!.cells[1]).toBe(0);
});
it("constraint history is independent from cell edit history", () => {
  const c: RegionConstraints = {
    width: 2,
    height: 2,
    geometryKey: geometryKey(defaultSettings),
    protectedCells: [1],
    regions: [],
  };
  useStudio.getState().setConstraints(c);
  expect(useStudio.getState().project.constraints).toEqual(c);
  useStudio.getState().undoConstraints();
  expect(useStudio.getState().project.constraints).toBeUndefined();
  expect(useStudio.getState().undoStack).toHaveLength(0);
});
it("generated constraints snapshot does not alias pending edits", () => {
  const c: RegionConstraints = {
    width: 2,
    height: 2,
    geometryKey: geometryKey(defaultSettings),
    protectedCells: [1],
    regions: [],
  };
  const p = project().pattern!;
  useStudio.getState().setPattern(p, c);
  c.protectedCells.push(2);
  expect(
    useStudio.getState().project.generatedConstraints!.protectedCells,
  ).toEqual([1]);
});
