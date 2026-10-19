"""Extracts The Seeker's ice-biome terrain tiling as JSON for bake_terrain.cjs: the three mosaic layers' rule masks
and the rules and tileset of the LDtk "Main" layer, following game/src/levelgen/{catalog,mosaic,ldtk_rules}.rs.

Usage: python3 extract_ice_tiling.py <the-seeker checkout> <output.json>   (needs Pillow)
"""
import base64, json, os, re, sys
from PIL import Image

SEEKER, OUT = sys.argv[1], sys.argv[2]
RULES = os.path.join(SEEKER, 'assets/levels/tiles/ldtk_rules')
MOSAICS = os.path.join(SEEKER, 'assets/levels/tiles/ice_biome/main_platforms')

# Mask colors (game/src/levelgen/compiler.rs). Black cells are required source and are what the rule claims.
CONDITIONS = {(0x6A, 0xBE, 0x30): ('src', 0), (0xAC, 0x32, 0x32): ('src', 1),
              (0x4B, 0xFF, 0x00): ('prim', 0), (0xFF, 0x00, 0x00): ('prim', 1),
              (0x35, 0x68, 0x20): ('self', 0), (0x68, 0x20, 0x20): ('self', 1)}


def number_after(name, marker):
    start = name.find(marker)
    digits = re.match(r'\d+', name[start + len(marker):]) if start >= 0 else None
    return int(digits.group()) if digits else None


def mosaic_layer(index):
    """A layer's rules in ascending order; rules sharing an order keep directory order, as in the game."""
    directory = os.path.join(MOSAICS, f'mosaic{index}', 'rules')
    rules = []
    for file in os.listdir(directory):
        if not file.lower().endswith('.png'):
            continue
        name = file[:-4].lower()
        order = re.match(r'\d+', name)
        if not order or '_rule' not in name:
            continue
        flag = lambda marker: marker in name or marker.replace('-', '_') in name
        prob = number_after(name, 'prob')
        rule = {'order': int(order.group()), 'rx': flag('ruleflip-x'), 'ry': flag('ruleflip-y'),
                'randx': flag('randflip-x'), 'randy': flag('randflip-y'), 'prob': 100 if prob is None else min(prob, 100),
                'src': [[], []], 'prim': [[], []], 'self': [[], []], 'claims': []}
        image = Image.open(os.path.join(directory, file)).convert('RGBA')
        cx, cy = image.width // 2, image.height // 2
        for y in range(image.height):
            for x in range(image.width):
                r, g, b, a = image.getpixel((x, y))
                if a < 128:
                    continue
                offset = [x - cx, y - cy]
                if (r, g, b) == (0, 0, 0):
                    rule['src'][0].append(offset)
                    rule['claims'].append(offset)
                elif (r, g, b) in CONDITIONS:
                    kind, forbid = CONDITIONS[(r, g, b)]
                    rule[kind][forbid].append(offset)
        rule['src'][0].sort(key=lambda o: abs(o[0]) + abs(o[1]))
        if rule['claims']:
            rules.append(rule)
    rules.sort(key=lambda r: r['order'])
    return rules


def main_layer():
    ldtk = json.load(open(os.path.join(RULES, 'level.01_test.ldtk')))
    layer = next(l for l in ldtk['defs']['layers'] if l['identifier'] == 'Main')
    tileset = next(t for t in ldtk['defs']['tilesets'] if t['uid'] == layer['tilesetDefUid'])
    groups = [g for g in layer.get('autoRuleGroups', []) if g.get('active', True)]

    def compiled(rule):
        size, pattern = rule['size'], rule['pattern']
        checks = [[i % size - size // 2, i // size - size // 2, v] for i, v in enumerate(pattern) if v != 0]
        checks.sort(key=lambda c: abs(c[0]) + abs(c[1]))
        center = (size // 2) * (size + 1)
        return {'uid': rule['uid'], 'center': pattern[center] if center < len(pattern) else 0, 'checks': checks,
                'tiles': [v for v in rule['tileRectsIds'] if v], 'fx': bool(rule.get('flipX')), 'fy': bool(rule.get('flipY')),
                'chance': rule.get('chance', 1.0), 'brk': rule.get('breakOnMatch', True)}

    def usable(rule):
        return rule.get('active', True) and any(rule.get('tileRectsIds') or [])

    stages = []
    for allowed in (['spikes'], ['wall0', 'wall1', 'wall2', 'wall3'], ['fog1', 'fog2', 'fog3'], ['fog_add']):
        stages.append([compiled(r) for g in groups if any(a in g['name'].lower() for a in allowed)
                       for r in g['rules'] if usable(r)])
    fallback = {}
    for g in groups:
        for r in g['rules']:
            if r.get('active', True) and r['size'] == 1 and len(r['pattern']) == 1 and usable(r):
                fallback.setdefault(str(r['pattern'][0]), next(v for v in r['tileRectsIds'] if v)[0])
    image = os.path.join(RULES, tileset['relPath'])
    return {'stages': stages, 'fallback': fallback, 'tilesPerRow': tileset['pxWid'] // tileset['tileGridSize'],
            'image': 'data:image/png;base64,' + base64.b64encode(open(image, 'rb').read()).decode()}


data = {'mosaics': [mosaic_layer(i) for i in (1, 2, 3)], 'main': main_layer()}
json.dump(data, open(OUT, 'w'), separators=(',', ':'))
print('mosaic rules', [len(m) for m in data['mosaics']], '| main rules', [len(s) for s in data['main']['stages']],
      '| fallback', data['main']['fallback'])
