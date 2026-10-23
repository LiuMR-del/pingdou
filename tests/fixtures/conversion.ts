import { defaultSettings, type ConvertInput } from "../../src/model";
import { defaultPalette } from "../../src/palettes";

export function gradientTexture(): ConvertInput {
  const width = 96,
    height = 96;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let rgb = [247, 242, 230];
      if (x > 14 && x < 82 && y > 8 && y < 53) {
        const light = Math.round((x - 14) / 5);
        rgb = [230 + light, 187 + light, 147 + light];
      }
      if (x > 20 && x < 76 && y >= 53) {
        const t = ((x * 17 + y * 13) % 11) - 5;
        rgb = [180 + t * 3, 165 + t * 3, 144 + t * 3];
      }
      if (((x >= 31 && x <= 34) || (x >= 61 && x <= 64)) && y >= 31 && y <= 36)
        rgb = [28, 22, 20];
      if (x > 40 && x < 56 && y === 44) rgb = [150, 55, 65];
      pixels.set([...rgb, 255], (y * width + x) * 4);
    }
  return {
    width,
    height,
    pixels,
    palette: defaultPalette,
    settings: {
      ...defaultSettings,
      longSide: 48,
      maxColors: 12,
      dithering: false,
    },
  };
}

export function legacyBaselineInput(): ConvertInput {
  const settings = { ...defaultSettings, longSide: 16, maxColors: 8 };
  delete settings.algorithm;
  return {
    width: 4,
    height: 4,
    pixels: new Uint8ClampedArray(
      Array.from({ length: 64 }, (_, i) =>
        i % 4 === 3 ? 255 : (i * 29) % 256,
      ),
    ),
    settings,
    palette: defaultPalette,
  };
}
