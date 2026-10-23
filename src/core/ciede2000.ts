import type { Lab } from './color';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** CIEDE2000, Sharma et al. reference implementation (CIE 142-2001). */
export function ciede2000(one: Lab, two: Lab): number {
  const c1 = Math.hypot(one.a, one.b);
  const c2 = Math.hypot(two.a, two.b);
  const cBar = (c1 + c2) / 2;
  const cBar7 = Math.pow(cBar, 7);
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + Math.pow(25, 7))));
  const a1Prime = (1 + g) * one.a;
  const a2Prime = (1 + g) * two.a;
  const c1Prime = Math.hypot(a1Prime, one.b);
  const c2Prime = Math.hypot(a2Prime, two.b);
  const hue = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const angle = Math.atan2(b, a) * DEG;
    return angle < 0 ? angle + 360 : angle;
  };
  const h1Prime = hue(a1Prime, one.b);
  const h2Prime = hue(a2Prime, two.b);
  const dL = two.l - one.l;
  const dC = c2Prime - c1Prime;
  const hDiff = Math.abs(h1Prime - h2Prime);
  const dHPrime = c1Prime * c2Prime === 0 ? 0 : hDiff <= 180 ? h2Prime - h1Prime : h2Prime <= h1Prime ? h2Prime - h1Prime + 360 : h2Prime - h1Prime - 360;
  const dH = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin((dHPrime / 2) * RAD);
  const lBar = (one.l + two.l) / 2;
  const cBarPrime = (c1Prime + c2Prime) / 2;
  let hBarPrime = h1Prime + h2Prime;
  if (c1Prime * c2Prime !== 0) {
    if (hDiff > 180) hBarPrime += hBarPrime < 360 ? 360 : -360;
    hBarPrime /= 2;
  }
  const t = 1 - 0.17 * Math.cos((hBarPrime - 30) * RAD) + 0.24 * Math.cos(2 * hBarPrime * RAD) + 0.32 * Math.cos((3 * hBarPrime + 6) * RAD) - 0.20 * Math.cos((4 * hBarPrime - 63) * RAD);
  const deltaTheta = 30 * Math.exp(-Math.pow((hBarPrime - 275) / 25, 2));
  const rC = 2 * Math.sqrt(Math.pow(cBarPrime, 7) / (Math.pow(cBarPrime, 7) + Math.pow(25, 7)));
  const sL = 1 + (0.015 * Math.pow(lBar - 50, 2)) / Math.sqrt(20 + Math.pow(lBar - 50, 2));
  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;
  const rT = -Math.sin(2 * deltaTheta * RAD) * rC;
  const lTerm = dL / sL;
  const cTerm = dC / sC;
  const hTerm = dH / sH;
  return Math.sqrt(lTerm * lTerm + cTerm * cTerm + hTerm * hTerm + rT * cTerm * hTerm);
}
