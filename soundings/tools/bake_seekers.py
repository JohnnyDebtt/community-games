#!/usr/bin/env python3
"""Bake every SEEKER NET seeker into a compact atlas the game draws from.

    python3 tools/bake_seekers.py <path to collections/SEEKER_NET> [--verify]

Uses the collection's own engine (engine/final.py) to place and recolour every
part of all 2,222 seekers, then writes:

  assets/seekernet/seekers-NN.png  atlas chunks of 128 cells (54x54, 4 per row,
                                 similar seekers together). Each pixel is one byte
                                 (a palette PNG whose entry k is grey k):
                                   0            empty
                                   1..E-1       index into `pairs`: colour, part and
                                                screen flag of the seeker without eyes
                                   E + e        an eye pixel of colour colors[eyeColors[e]], over
                                                the black screen (pair `eyeUnder`)
  assets/seekernet/seekers.json  colours, pairs, trait names, one row per token (with
                                 its chunk and cell), the battery icons and the shades
  assets/seekernet/backgrounds.png  the 8 activated backgrounds + the uncharged one

From these the game rebuilds, pixel for pixel, a token's activated still (over its
background) and its six uncharged pictures. --verify checks every one of them
against the checksums in lists/tokens.csv (about a minute).

Needs Pillow and numpy (pip3 install -r <SEEKER_NET>/requirements.txt).
"""
import argparse
import csv
import hashlib
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'seekernet')
COLS = 48          # working atlas (in memory)
CHUNK, CHUNK_COLS = 128, 4
PARTS = ['Floating Object', 'Back', 'Base', 'Flank', 'Head']   # paint order; eyes ride in G


# The art is an oblique view: the lid (top face) recedes up and to the left, the left
# bevel (side face) recedes left. Classify every base pixel by face so the game can
# rebuild each monitor as a real box: '.' empty, 'l' lid, 'b' bevel, 'f' front.
LID_ROLES = {'R', 'T'}
FRONT_ROLES = {'B', 'P', 'X', 'S', 'I', 'G', 'W'}


def base_geometry(F, name):
    from statistics import median
    px = F.layer(F.BASES[name])
    roles = {}
    for p, c in px.items():
        h = '#%02x%02x%02x' % c[:3]
        roles[p] = F.MASTER.get(h) or {'#d5f8fc': 'R', '#8ea6db': 'A', '#6c78a2': 'L', '#48557e': 'K', '#82b7b4': 'G',
                                       '#3a7581': 'I', '#ffffff': 'W', '#000000': 'Z'}.get(h, '?')
    cls = {}
    # rim accents next to the lid belong to the lid
    lidlike = lambda p: roles[p] in LID_ROLES or (roles[p] == 'A' and any(roles.get((p[0] + d, p[1])) == 'T' for d in (-2, -1, 1, 2)))
    for x in range(54):
        ys = sorted(y for (xx, y) in px if xx == x)
        for y in ys:
            if lidlike((x, y)):
                cls[(x, y)] = 'l'
            else:
                break
    last_fl = None
    for y in range(54):
        xs = sorted(x for (x, yy) in px if yy == y and (x, yy) not in cls)
        if not xs:
            continue
        fl = next((x for x in xs if roles[(x, y)] in FRONT_ROLES), None)
        if fl is None:
            # above the front: the top of the bevel; below it: the bottom rim
            fl = last_fl if last_fl is not None else 99
        elif last_fl is not None and fl > last_fl + 2:
            fl = last_fl        # a side module's front further right: the main box goes on
        else:
            last_fl = fl
        for x in xs:
            cls[(x, y)] = 'b' if x < fl else 'f'
    widths, heights = [], []
    for y in range(54):
        row = [x for (x, yy), k in cls.items() if yy == y]
        f = [x for (x, yy), k in cls.items() if yy == y and k == 'f']
        if f and row:
            widths.append(min(f) - min(row))
    fx = [x for (x, y), k in cls.items() if k == 'f']
    for x in range(min(fx), max(fx) + 1):
        col = [y for (xx, y), k in cls.items() if xx == x]
        f = [y for (xx, y), k in cls.items() if xx == x and k == 'f']
        if f and col:
            heights.append(min(f) - min(col))
    mask = ''.join(cls.get((x, y), '.') for y in range(54) for x in range(54))
    return {'mask': mask, 'wb': int(round(median(widths))), 'hl': int(round(median(heights)))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('seeker_net', help='path to collections/SEEKER_NET')
    ap.add_argument('--verify', action='store_true', help='check every picture against the checksums')
    a = ap.parse_args()
    root = os.path.abspath(a.seeker_net)
    sys.path.insert(0, os.path.join(root, 'engine'))
    import numpy as np
    from PIL import Image
    import final as F

    with open(os.path.join(root, 'lists', 'tokens.csv'), newline='') as fh:
        rows = list(csv.DictReader(fh))
    assert len(rows) == 2222

    names = {k: [] for k in F.KEYS + ['Background', 'Loadout']}
    for k in names:
        names[k] = sorted({r[k] for r in rows if r[k] != 'None'})

    colors, color_ix = [], {}

    def cix(h):
        h = h.lower()
        if h not in color_ix:
            color_ix[h] = len(colors)
            colors.append(h)
        return color_ix[h]

    eye_colors = []          # indices into colors, for eye pixels

    def eix(h):
        c = cix(h)
        if c not in eye_colors:
            eye_colors.append(c)
        return eye_colors.index(c)

    pairs, pair_ix = [None], {}

    def pix(c, part, screen):
        key = (cix(c), part, screen)
        if key not in pair_ix:
            pair_ix[key] = len(pairs)
            pairs.append(list(key))
        return pair_ix[key]

    battery = []
    for s in range(1, 7):
        im = Image.open(os.path.join(root, 'layers', 'uncharged', f'battery{s}.png')).convert('RGBA')
        battery.append([[x, y, cix('#%02x%02x%02x' % im.getpixel((x, y))[:3])]
                        for y in range(im.height) for x in range(im.width) if im.getpixel((x, y))[3]])
    shades = [F.shade_alpha(s) for s in range(1, 7)]

    H = math.ceil(len(rows) / COLS) * 54
    atlas = np.zeros((H, COLS * 54, 3), dtype=np.uint8)
    table = []
    for i, r in enumerate(rows):
        t = {k: (None if r[k] == 'None' else r[k]) for k in F.KEYS}
        assert int(r['token']) == i + 1
        body = F.compose(t, background=(0, 0, 0, 0), eyes=False)
        parts = F.layers(t)
        top = {}
        for part, px in parts:
            if part == 'Eyes':
                continue
            for p in px:
                top[p] = PARTS.index(part)
        eyes = dict(next(px for part, px in parts if part == 'Eyes'))
        screen, _ = F.screen_px(t)
        cy, cx = (i // COLS) * 54, (i % COLS) * 54
        bp = body.load()
        for y in range(54):
            for x in range(54):
                rr, gg, bb, al = bp[x, y]
                if al:
                    atlas[cy + y, cx + x, 0] = pix('#%02x%02x%02x' % (rr, gg, bb), top[(x, y)],
                                                   1 if (x, y) in screen else 0)
                elif (x, y) in screen:
                    raise SystemExit(f'token {i + 1}: empty screen pixel')
                if (x, y) in eyes:
                    atlas[cy + y, cx + x, 1] = eix(eyes[(x, y)]) + 1
        # battery offset: charge_px places the icon on the base's screen; the picture
        # then shifts by (sx, mdy). The icon bbox is the same at every stage.
        b = F.base(t['Base'])
        mdy = F.layout(t)[0]
        sx = (F.scene_fit(t) or (0, 0))[0]
        xs = [p[0] for p in battery[0]]
        ys = [p[1] for p in battery[0]]
        dx = F._rnd(b.eye_c[0] - (min(xs) + max(xs)) / 2)
        v = b.eye_c[1] - (min(ys) + max(ys)) / 2
        dy = F._rnd(v) if t['Base'] in F.BASES_EYES_LEAN_DOWN else math.ceil(v - 0.5)
        for s in range(1, 7):
            mine = {(x + dx, y + dy) for x, y, _ in battery[s - 1] if (x + dx, y + dy) in b.screen}
            assert mine == set(F.charge_px(s, t['Base'])), (i + 1, s)
        table.append([int(r['artwork'])] +
                     [names[k].index(r[k]) if r[k] != 'None' else -1 for k in F.KEYS] +
                     [names['Background'].index(r['Background']), names['Loadout'].index(r['Loadout']),
                      int(r['starting_charge']), int(r['charge_rank']), dx + sx, dy + mdy])
        if (i + 1) % 200 == 0:
            print(f'  {i + 1} / 2222', flush=True)

    eye = atlas[..., 1] > 0
    under = set(atlas[..., 0][eye].tolist())
    assert len(under) == 1, under
    eye_under = under.pop()
    eye_base = len(pairs)
    single = atlas[..., 0].astype(np.int32)
    single[eye] = eye_base - 1 + atlas[..., 1][eye].astype(np.int32)
    assert single.max() < 256, single.max()
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith('seekers') and f.endswith('.png'):
            os.remove(os.path.join(OUT, f))
    # similar seekers next to each other compress better
    order = sorted(range(len(rows)), key=lambda i: tuple(table[i][1:9]))
    grey = [v for k in range(256) for v in (k, k, k)]
    chunks = math.ceil(len(order) / CHUNK)
    for c in range(chunks):
        ids = order[c * CHUNK:(c + 1) * CHUNK]
        R = math.ceil(len(ids) / CHUNK_COLS)
        img = np.zeros((R * 54, CHUNK_COLS * 54), dtype=np.uint8)
        for k, i in enumerate(ids):
            sy, sx = (i // COLS) * 54, (i % COLS) * 54
            dy, dx = (k // CHUNK_COLS) * 54, (k % CHUNK_COLS) * 54
            img[dy:dy + 54, dx:dx + 54] = single[sy:sy + 54, sx:sx + 54]
            table[i] += [c, k]
        im = Image.fromarray(img).convert('P')
        im.putpalette(grey)
        im.save(os.path.join(OUT, f'seekers-{c:02d}.png'), optimize=True)
    # where each token's base layer sits in its picture (for the 3D rebuild)
    for i, r in enumerate(rows):
        t = {k: (None if r[k] == 'None' else r[k]) for k in F.KEYS}
        table[i] += [(F.scene_fit(t) or (0, 0))[0], F.layout(t)[0]]
    bases = {n: base_geometry(F, n) for n in names['Base']}

    bgs = Image.new('RGB', (54 * 9, 54))
    for k, n in enumerate(names['Background']):
        bgs.paste(Image.open(os.path.join(root, 'layers', 'backgrounds', n + '.png')).convert('RGB'), (54 * k, 0))
    bgs.paste(Image.open(os.path.join(root, 'layers', 'uncharged', 'background.png')).convert('RGB'), (54 * 8, 0))
    bgs.save(os.path.join(OUT, 'backgrounds.png'), optimize=True)

    meta = {
        'about': 'SEEKER NET art baked by tools/bake_seekers.py from TheSeekerGame/collections (MIT OR Apache-2.0)',
        'cell': 54, 'cols': COLS, 'count': len(rows),
        'columns': ['artwork'] + F.KEYS + ['Background', 'Loadout', 'startingCharge', 'chargeRank',
                                           'batteryX', 'batteryY', 'chunk', 'cell', 'baseDx', 'baseDy'],
        'parts': PARTS,
        'traits': names,
        'colors': colors,
        'pairs': pairs,
        'eyeBase': eye_base,
        'eyeColors': eye_colors,
        'eyeUnder': eye_under,
        'chunks': chunks, 'chunkCols': CHUNK_COLS,
        'battery': battery,
        'shades': shades,
        'bases': bases,
        'tokens': table,
    }
    with open(os.path.join(OUT, 'seekers.json'), 'w') as fh:
        json.dump(meta, fh, separators=(',', ':'))
    print(f'{len(colors)} colours, {len(pairs) - 1} pairs ->', OUT)

    if a.verify:
        verify(rows, meta, root, np, Image)


def cell_of(i, chunks, meta):
    """Token i+1's 54x54 cell of bytes, read back from the chunk files."""
    row = meta['tokens'][i]
    img = chunks[row[14]]
    k, cc = row[15], meta['chunkCols']
    return img[(k // cc) * 54:(k // cc) * 54 + 54, (k % cc) * 54:(k % cc) * 54 + 54]


def rebuild(i, chunks, meta, np, stage=None, bg_rgb=None):
    """The picture the game draws for token i+1 (stage None = activated).
    Mirrors src/net/seekerart.js."""
    cell = cell_of(i, chunks, meta)
    cols = [tuple(int(h[k:k + 2], 16) for k in (1, 3, 5)) for h in meta['colors']]
    pairs, eb = meta['pairs'], meta['eyeBase']
    rgb = np.zeros((54, 54, 3), dtype=np.int32)
    solid = np.zeros((54, 54), dtype=bool)
    screen = np.zeros((54, 54), dtype=bool)
    for y in range(54):
        for x in range(54):
            v = int(cell[y, x])
            if not v:
                continue
            p = meta['eyeUnder'] if v >= eb else v
            c, _, s = pairs[p]
            rgb[y, x] = cols[c]
            solid[y, x] = True
            screen[y, x] = bool(s)
            if stage is None and v >= eb:
                rgb[y, x] = cols[meta['eyeColors'][v - eb]]
    row = meta['tokens'][i]
    if stage is None:
        # background shows where empty pixels reach the edge; enclosed ones stay black
        out = np.zeros_like(solid)
        empty = ~solid
        out[0], out[-1], out[:, 0], out[:, -1] = empty[0], empty[-1], empty[:, 0], empty[:, -1]
        while True:
            g = out.copy()
            g[1:] |= out[:-1]
            g[:-1] |= out[1:]
            g[:, 1:] |= out[:, :-1]
            g[:, :-1] |= out[:, 1:]
            g &= empty
            if (g == out).all():
                break
            out = g
        rgb[out] = bg_rgb[out]
        return rgb.astype(np.uint8)
    bx, by = row[12], row[13]
    for x, y, c in meta['battery'][stage - 1]:
        x, y = x + bx, y + by
        if 0 <= x < 54 and 0 <= y < 54 and screen[y, x]:
            rgb[y, x] = cols[c]
    keep = 255 - meta['shades'][stage - 1]
    rgb[solid] = rgb[solid] * keep // 255
    res = bg_rgb.astype(np.int32).copy()
    res[solid] = rgb[solid]
    return res.astype(np.uint8)


def verify(rows, meta, root, np, Image):
    chunks = [np.array(Image.open(os.path.join(OUT, f'seekers-{c:02d}.png')).convert('L'))
              for c in range(meta['chunks'])]
    bgs = {n: np.array(Image.open(os.path.join(root, 'layers', 'backgrounds', n + '.png')).convert('RGB'))
           for n in meta['traits']['Background']}
    dormant = np.array(Image.open(os.path.join(root, 'layers', 'uncharged', 'background.png')).convert('RGB'))
    bad = 0
    for i, r in enumerate(rows):
        got = hashlib.sha256(rebuild(i, chunks, meta, np, None, bgs[r['Background']]).tobytes()).hexdigest()
        bad += got != r['activated_still_pixels_sha256']
        for s in range(1, 7):
            got = hashlib.sha256(rebuild(i, chunks, meta, np, s, dormant).tobytes()).hexdigest()
            bad += got != r[f'uncharged_stage_{s}_pixels_sha256']
        if (i + 1) % 200 == 0:
            print(f'  verified {i + 1} / 2222, mismatches so far: {bad}', flush=True)
    print('verify:', 'every picture matches the collection' if not bad else f'{bad} mismatches')


if __name__ == '__main__':
    main()
