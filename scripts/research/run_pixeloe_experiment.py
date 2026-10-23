#!/usr/bin/env python3
"""Reproducible local comparison of area and PixelOE reference downsampling.

This script only uses a deterministic self-made image. It never reads or uploads
user images. PixelOE is imported from a local checkout supplied by
--pixeloe-source (or PIXELOE_SOURCE).
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import cv2
import numpy as np
from PIL import Image

PIXEL_OE_REVISION = "7ce444b36d3876a151d845d4493240e904454d89"
PIXEL_OE_URL = "https://github.com/KohakuBlueleaf/PixelOE"


def make_sample(size: int = 256) -> Tuple[np.ndarray, Dict[str, np.ndarray]]:
    """Create a deterministic cartoon with skin gradient, small eyes and texture."""
    h = w = size
    yy, xx = np.mgrid[0:h, 0:w]
    rgb = np.zeros((h, w, 3), dtype=np.float32)
    rgb[:] = np.array([245.0, 232.0, 215.0], dtype=np.float32)

    # Shirt/body with a gently varying base color.
    shirt = (yy >= 145) & (np.abs(xx - w / 2) <= (52 + (yy - 145) * 0.24))
    shirt_base = np.stack(
        [50 + 7 * (yy / h), 126 + 10 * (xx / w), 151 + 8 * (yy / h)], axis=-1
    )
    rgb[shirt] = shirt_base[shirt]

    # Fine plaid/diagonal pattern, deliberately below the 32-grid cell scale.
    stripe = ((xx + 2 * yy) % 11 < 2) | ((2 * xx - yy) % 13 < 2)
    rgb[shirt & stripe] = np.array([234.0, 181.0, 84.0])
    dots = (((xx - 3) % 17) ** 2 + ((yy - 3) % 17) ** 2) < 8
    rgb[shirt & dots] = np.array([36.0, 78.0, 103.0])

    # A furry/textured patch on the right side of the shirt.
    fur = shirt & (xx > 158)
    noise = ((xx * 17 + yy * 31 + (xx * yy) % 23) % 29) / 29.0
    fur_color = np.stack(
        [184 + 35 * noise, 128 + 28 * noise, 93 + 22 * noise], axis=-1
    )
    rgb[fur] = fur_color[fur]
    fur_dash = fur & (((xx + 3 * yy) % 7) < 2)
    rgb[fur_dash] = np.array([112.0, 76.0, 59.0])

    # Face and ears with a visible but smooth skin gradient.
    face = (((xx - 128.0) / 62.0) ** 2 + ((yy - 91.0) / 65.0) ** 2) <= 1.0
    ear_l = (((xx - 70.0) / 17.0) ** 2 + ((yy - 101.0) / 23.0) ** 2) <= 1.0
    ear_r = (((xx - 186.0) / 17.0) ** 2 + ((yy - 101.0) / 23.0) ** 2) <= 1.0
    skin = face | ear_l | ear_r
    light = 1.0 - 0.12 * ((xx - 102.0) ** 2 + (yy - 55.0) ** 2) ** 0.5 / 160.0
    skin_color = np.stack(
        [224 * light + 8 * (yy / h), 151 * light + 8 * (yy / h), 119 * light + 7 * (xx / w)],
        axis=-1,
    )
    rgb[skin] = skin_color[skin]

    # Hair/outline and small black eyes; these are intentionally easy to lose.
    hair = ((xx - 128) ** 2 / 70**2 + (yy - 39) ** 2 / 25**2) < 1
    rgb[hair] = np.array([72.0, 49.0, 48.0])
    eye_l = ((xx - 104) ** 2 + (yy - 88) ** 2) <= 4**2
    eye_r = ((xx - 152) ** 2 + (yy - 88) ** 2) <= 4**2
    eyes = eye_l | eye_r
    rgb[eyes] = np.array([18.0, 16.0, 17.0])
    # Tiny eye highlights keep the sample cartoon-like while retaining black area.
    highlights = (((xx - 103) ** 2 + (yy - 87) ** 2) <= 1) | (((xx - 151) ** 2 + (yy - 87) ** 2) <= 1)
    rgb[highlights] = np.array([245.0, 232.0, 215.0])

    # Nose and smile; mouth is another narrow high-contrast feature.
    cv = np.clip(1.0 - np.abs(xx - 128) / 8.0, 0, 1) * np.clip((yy - 102) / 9.0, 0, 1)
    rgb[skin] = np.clip(rgb[skin] - np.stack([7 * cv, 9 * cv, 9 * cv], axis=-1)[skin], 0, 255)
    mouth = (((xx - 128) / 15.0) ** 2 + ((yy - 119) / 7.0) ** 2 < 1) & (yy >= 118)
    rgb[mouth] = np.array([79.0, 35.0, 39.0])

    # A thin, hand-drawn boundary between face and shirt.
    boundary = (yy >= 143) & (yy <= 147) & (np.abs(xx - 128) < 55)
    rgb[boundary] = np.array([104.0, 65.0, 58.0])

    rgb = np.clip(rgb, 0, 255).astype(np.uint8)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    masks = {
        "skin": skin,
        "eyes": eyes,
        "shirt": shirt,
        "fur": fur,
    }
    return bgr, masks


def save_rgb(path: Path, bgr: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)).save(path)


def nearest_preview(grid_bgr: np.ndarray, side: int = 512) -> np.ndarray:
    return cv2.resize(grid_bgr, (side, side), interpolation=cv2.INTER_NEAREST)


def area_grid(image_bgr: np.ndarray, grid: int) -> np.ndarray:
    return cv2.resize(image_bgr, (grid, grid), interpolation=cv2.INTER_AREA)


def import_pixeloe(source: str):
    source_path = Path(source).expanduser().resolve()
    if not source_path.exists():
        raise RuntimeError(
            "PixelOE source not found. Clone the pinned revision locally and pass "
            f"--pixeloe-source; looked for {source_path}"
        )
    sys.path.insert(0, str(source_path))
    try:
        from pixeloe.legacy.downscale.contrast_based import contrast_based_downscale
        from pixeloe.legacy.outline import outline_expansion
    except Exception as exc:
        raise RuntimeError(f"PixelOE legacy reference import failed: {exc}") from exc
    return contrast_based_downscale, outline_expansion


def mask_to_grid(mask: np.ndarray, grid: int) -> np.ndarray:
    return cv2.resize(mask.astype(np.uint8), (grid, grid), interpolation=cv2.INTER_AREA) >= 0.25


def rgb_grid(bgr: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32)


def metrics(
    name: str,
    grid: int,
    output_bgr: np.ndarray,
    area_bgr: np.ndarray,
    masks: Dict[str, np.ndarray],
) -> Dict[str, object]:
    out = rgb_grid(output_bgr)
    area = rgb_grid(area_bgr)
    gray = cv2.cvtColor(output_bgr, cv2.COLOR_BGR2GRAY)
    skin = mask_to_grid(masks["skin"], grid)
    eyes = mask_to_grid(masks["eyes"], grid)
    shirt = mask_to_grid(masks["shirt"], grid)
    fur = mask_to_grid(masks["fur"], grid)
    non_eye = ~eyes
    gy = np.abs(np.diff(gray.astype(np.float32), axis=0)).mean()
    gx = np.abs(np.diff(gray.astype(np.float32), axis=1)).mean()
    shirt_pixels = out[shirt]
    fur_pixels = out[fur]
    return {
        "sample": "selfmade_cartoon_texture",
        "grid": grid,
        "method": name,
        "width": int(output_bgr.shape[1]),
        "height": int(output_bgr.shape[0]),
        "unique_rgb_cells": int(np.unique(out.reshape(-1, 3), axis=0).shape[0]),
        "mae_vs_area_rgb": round(float(np.abs(out - area).mean()), 5),
        "mean_edge_jump_luma": round(float((gx + gy) / 2.0), 5),
        "eye_dark_recall": round(float((gray[eyes] < 90).mean()) if eyes.any() else 0.0, 5),
        "non_eye_dark_rate": round(float((gray[non_eye] < 90).mean()) if non_eye.any() else 0.0, 5),
        "skin_rgb_std_mean": round(float(skin_pixels_std(out, skin)), 5),
        "shirt_rgb_std_mean": round(float(skin_pixels_std(out, shirt)), 5),
        "fur_rgb_std_mean": round(float(skin_pixels_std(out, fur)), 5),
        "shirt_unique_rgb_cells": int(np.unique(shirt_pixels.reshape(-1, 3), axis=0).shape[0]) if shirt_pixels.size else 0,
        "fur_unique_rgb_cells": int(np.unique(fur_pixels.reshape(-1, 3), axis=0).shape[0]) if fur_pixels.size else 0,
    }


def skin_pixels_std(out: np.ndarray, mask: np.ndarray) -> float:
    pixels = out[mask]
    if pixels.size == 0:
        return 0.0
    return float(pixels.std(axis=0).mean())


def dependency_versions() -> Dict[str, str]:
    versions: Dict[str, str] = {}
    for name, module_name in [("numpy", "numpy"), ("opencv", "cv2"), ("pillow", "PIL")]:
        module = __import__(module_name)
        versions[name] = str(getattr(module, "__version__", "unknown"))
    try:
        import torch

        versions["torch"] = str(torch.__version__)
    except Exception as exc:
        versions["torch"] = f"unavailable: {exc}"
    return versions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="docs/assets/algorithm/pixeloe-experiment", help="output directory")
    parser.add_argument(
        "--pixeloe-source",
        default=os.environ.get("PIXELOE_SOURCE", "/tmp/pixeloe-research/PixelOE/src"),
        help="local PixelOE checkout's src directory",
    )
    args = parser.parse_args()
    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    contrast_downscale, outline_expansion = import_pixeloe(args.pixeloe_source)
    image_bgr, masks = make_sample()
    save_rgb(out_dir / "input-selfmade-cartoon-texture.png", image_bgr)

    rows: List[Dict[str, object]] = []
    timings: List[Dict[str, object]] = []
    for grid in (32, 64):
        area = area_grid(image_bgr, grid)
        methods = {
            "area": lambda: area,
            "pixeloe_contrast": lambda: contrast_downscale(image_bgr, target_size=grid),
            "pixeloe_weak_outline": lambda: contrast_downscale(
                outline_expansion(
                    image_bgr,
                    erode=1,
                    dilate=1,
                    k=max(2, 256 // grid),
                    avg_scale=9,
                    dist_scale=4,
                )[0],
                target_size=grid,
            ),
        }
        for method, fn in methods.items():
            start = time.perf_counter()
            result = fn().astype(np.uint8)
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            if result.shape[:2] != (grid, grid):
                raise RuntimeError(f"{method} returned {result.shape}, expected {grid}x{grid}")
            save_rgb(out_dir / f"{method}-{grid}grid.png", result)
            save_rgb(out_dir / f"{method}-{grid}grid-preview.png", nearest_preview(result))
            rows.append(metrics(method, grid, result, area, masks))
            timings.append({"grid": grid, "method": method, "elapsed_ms": round(elapsed_ms, 5)})

    with (out_dir / "metrics.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "sample": "selfmade_cartoon_texture",
        "sample_description": "Deterministic 256x256 cartoon: gradient skin, small black eyes, fine-pattern shirt, deterministic furry patch.",
        "input_is_user_image": False,
        "uploaded": False,
        "grids": [32, 64],
        "methods": ["area", "pixeloe_contrast", "pixeloe_weak_outline"],
        "conditions": {
            "input_size": [256, 256],
            "output_grid": "square 32x32 or 64x64",
            "area_interpolation": "OpenCV INTER_AREA",
            "pixeloe_contrast": "PixelOE legacy contrast_based_downscale, target_size=grid",
            "pixeloe_weak_outline": "PixelOE legacy outline_expansion(erode=1,dilate=1,k=patch,avg_scale=9,dist_scale=4) then contrast_based_downscale",
            "color_quantization": "none; outputs are raw RGB downsampling references, not Demo56 or retail color-card mappings",
        },
        "pixeloe": {
            "url": PIXEL_OE_URL,
            "revision": PIXEL_OE_REVISION,
            "source": str(Path(args.pixeloe_source).resolve()),
        },
        "dependencies": dependency_versions(),
        "timings": timings,
        "metrics_file": "metrics.csv",
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(out_dir), "rows": rows, "timings": timings}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
