import type { BeadColor, Palette } from '../model';

export interface Lab { l: number; a: number; b: number }

const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
const REF_X = 0.95047;
const REF_Y = 1;
const REF_Z = 1.08883;

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) throw new Error(`Invalid color: ${hex}`);
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

export function srgbToLinear(value: number): number {
  const v = clamp01(value);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(value: number): number {
  const v = Math.max(0, value);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function rgbToLab(red: number, green: number, blue: number): Lab {
  const r = srgbToLinear(red / 255);
  const g = srgbToLinear(green / 255);
  const b = srgbToLinear(blue / 255);
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / REF_X;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / REF_Y;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / REF_Z;
  const f = (value: number) => value > EPSILON ? Math.cbrt(value) : (KAPPA * value + 16) / 116;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function paletteLabs(palette: Palette): Lab[] {
  return palette.colors.map((color: BeadColor) => {
    const [r, g, b] = hexToRgb(color.hex);
    return rgbToLab(r, g, b);
  });
}

export function labDistanceSquared(one: Lab, two: Lab): number {
  const dl = one.l - two.l;
  const da = one.a - two.a;
  const db = one.b - two.b;
  return dl * dl + da * da + db * db;
}
