export const EMPTY = 65535;
export interface BeadColor {
  code: string;
  name: string;
  hex: string;
}
export interface Palette {
  id: string;
  name: string;
  version: string;
  source: string;
  license: string;
  verified: boolean;
  colors: BeadColor[];
}
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Settings {
  longSide: number;
  maxColors: number;
  mode: "photo" | "pixel";
  dithering: boolean;
  cleanup: boolean;
  alphaThreshold: number;
  background: string;
  beadSize: number;
  crop: CropRect | null;
  rotation: number;
  paletteId: string;
  algorithm?: "baseline" | "region";
  smoothing?: 0 | 1 | 2;
  sampling?: "area" | "contrast";
  outline?: boolean;
  spatialStrength?: 0 | 1 | 2;
}
export interface RegionLock {
  id: string;
  indices: number[];
  colors: number[];
}
export interface RegionConstraints {
  width: number;
  height: number;
  geometryKey: string;
  protectedCells: number[];
  regions: RegionLock[];
}
export function geometryKey(settings: Settings): string {
  return JSON.stringify([settings.longSide, settings.crop, settings.rotation]);
}
export const defaultSettings: Settings = {
  longSide: 48,
  maxColors: 16,
  mode: "photo",
  dithering: false,
  cleanup: false,
  alphaThreshold: 128,
  background: "#ffffff",
  beadSize: 2.6,
  crop: null,
  rotation: 0,
  paletteId: "demo-v1",
  algorithm: "baseline",
  smoothing: 1,
  sampling: "area",
  outline: false,
  spatialStrength: 1,
};
export interface SourceImage {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}
export interface Pattern {
  width: number;
  height: number;
  cells: number[];
  palette: Palette;
  settings: Settings;
  algorithmVersion: string;
  durationMs: number;
  diagnostics?: {
    energy: number[];
    smallComponentsBefore: number;
    smallComponentsAfter: number;
  };
}
export interface Project {
  schemaVersion: 1;
  id: string;
  title: string;
  source: SourceImage | null;
  settings: Settings;
  pattern: Pattern | null;
  edited: boolean;
  updatedAt: string;
  constraints?: RegionConstraints;
  generatedConstraints?: RegionConstraints;
}
export interface ColorUsage {
  index: number;
  color: BeadColor;
  count: number;
}
export interface CellChange {
  index: number;
  before: number;
  after: number;
}
export type Tool =
  | "move"
  | "brush"
  | "erase"
  | "pick"
  | "select"
  | "select-add"
  | "select-remove";
export interface ConvertInput {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  settings: Settings;
  palette: Palette;
  constraints?: RegionConstraints;
}
export interface ConvertRequest {
  id: number;
  input: ConvertInput;
}
export type ConvertResponse =
  { id: number; pattern: Pattern } | { id: number; error: string };
export function dimensions(width: number, height: number, longSide: number) {
  return width >= height
    ? {
        width: longSide,
        height: Math.max(1, Math.round((longSide * height) / width)),
      }
    : {
        width: Math.max(1, Math.round((longSide * width) / height)),
        height: longSide,
      };
}
