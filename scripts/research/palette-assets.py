#!/usr/bin/env python3
"""Prepare project-authored inputs and render local palette comparison assets."""
import argparse
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/assets/algorithm/palette-one-swap'


def prepare():
    OUT.mkdir(parents=True, exist_ok=True)
    texture = Image.open(ROOT / 'docs/assets/algorithm/pixeloe-experiment/input-selfmade-cartoon-texture.png').convert('RGBA')
    texture.save(OUT / 'texture-input.png')
    (OUT / 'texture.rgba').write_bytes(texture.tobytes())

    # Re-rasterize the project cat geometry with Pillow; not browser Canvas output.
    scale = 4
    cat = Image.new('RGB', (400 * scale, 400 * scale), '#f4e8d8')
    d = ImageDraw.Draw(cat)
    def ellipse(box, fill):
        d.ellipse(tuple(round(x * scale) for x in box), fill=fill)
    def polygon(points, fill):
        d.polygon([(round(x * scale), round(y * scale)) for x, y in points], fill=fill)
    ellipse((46, 314, 354, 358), '#92b7a0')
    polygon([(104, 163), (100, 65), (167, 116), (234, 116), (300, 65), (296, 165)], '#f8bd78')
    polygon([(112, 89), (112, 147), (148, 121)], '#e38e82')
    polygon([(288, 89), (288, 147), (252, 121)], '#e38e82')
    ellipse((88, 97, 312, 317), '#f8bd78')
    ellipse((123, 198, 277, 310), '#fff4df')
    for x in (156, 244):
        ellipse((x - 10, 187, x + 10, 217), '#344b42')
    polygon([(188, 235), (212, 235), (200, 247)], '#b75a58')
    for sign in (-1, 1):
        points = [(200, 247), (200, 256)]
        for n in range(1, 33):
            t = n / 32
            points.append(((1-t)**2*200 + 2*(1-t)*t*(200+sign*10) + t*t*(200+sign*19),
                           (1-t)**2*256 + 2*(1-t)*t*269 + t*t*259))
        d.line([(round(x*scale), round(y*scale)) for x,y in points], fill='#715744', width=4*scale)
    for x in (128, 272):
        ellipse((x-17, 228, x+17, 246), '#e89c8c')
    cat = cat.resize((400, 400), Image.Resampling.LANCZOS).convert('RGBA')
    cat.save(OUT / 'cat-redrawn-input.png')
    (OUT / 'cat-redrawn.rgba').write_bytes(cat.tobytes())
    (OUT / 'inputs.json').write_text(json.dumps({
        'texture': {'width': texture.width, 'height': texture.height, 'source': 'existing project-authored PNG; no user image'},
        'cat-redrawn': {'width': 400, 'height': 400, 'source': 'Pillow reconstruction of src/image.ts cat geometry; not pixel-identical to browser Canvas'},
        'gradient': {'width': 96, 'height': 96, 'source': 'tests/fixtures/conversion.ts deterministic project-authored array'},
    }, indent=2) + '\n')


def render():
    records = json.loads((OUT / 'results.json').read_text())
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 17)
    small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 14)
    for name in ('gradient', 'texture', 'cat-redrawn'):
        rs = [r for r in records['cases'] if r['sample'] == name]
        source = Image.frombytes('RGBA', (rs[0]['sourceWidth'], rs[0]['sourceHeight']), (OUT / f'{name}.rgba').read_bytes())
        source.save(OUT / f'{name}-input.png')
        sheet = Image.new('RGB', (1040, 1640), '#f7f8f5')
        draw = ImageDraw.Draw(sheet)
        draw.text((20, 14), f'{name} | same Demo56, no dither / cleanup | self-made, not a photo', fill='#24312f', font=font)
        sheet.paste(source.resize((240,240), Image.Resampling.NEAREST).convert('RGB'), (400, 50))
        for col, grid in enumerate((32,48,64)):
            draw.text((col*340+60, 310), f'{grid} x {grid}', fill='#24312f', font=font)
        for row, (budget, variant) in enumerate(((8,'baseline'),(8,'candidate'),(16,'baseline'),(16,'candidate'))):
            y = 350 + row*320
            for col, grid in enumerate((32,48,64)):
                r = next(r for r in rs if r['grid']==grid and r['budget']==budget)
                p = r[variant]['pattern']
                pixels = [tuple(bytes.fromhex(p['palette']['colors'][i]['hex'][1:])) if i != 65535 else (238,241,235) for i in p['cells']]
                img = Image.new('RGB',(p['width'],p['height'])); img.putdata(pixels)
                img.save(OUT / f'{name}-{grid}-{budget}-{variant}.png')
                x = col*340+20
                draw.text((x,y), f'{budget} colors | {variant}', fill='#24312f', font=font)
                sheet.paste(img.resize((280,280),Image.Resampling.NEAREST),(x,y+24))
        sheet.save(OUT / f'{name}-comparison.png')
    print('Rendered three comparison sheets in', OUT)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['prepare','render'])
    args = parser.parse_args()
    prepare() if args.mode == 'prepare' else render()
