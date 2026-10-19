#!/usr/bin/env python3
"""Builds assets/fonts/SeekerPixel.woff2 from The Seeker's bitmap font.

The Seeker draws its small text with assets/font/PixelFont2.png: three bands of glyphs
(ASCII 32-64, 65-95, 96-126) in cells divided by magenta, each glyph white with a few
grey corner pixels and a dark drop shadow one pixel down and to the right. This keeps
the white pixels as squares in a vector font (the shadow is drawn by CSS, so it can
follow the text color), and adds the few glyphs the game needs that the bitmap lacks.

One font pixel is 100 units and the em is 10 pixels, so at a CSS font size of 10 * N px
every font pixel is N px. Baseline 8 pixels below the band top, 3 below for descenders.

    pip install fonttools brotli pillow
    python3 tools/make_font.py ../the-seeker/assets/font/PixelFont2.png
"""

import sys
from pathlib import Path

from PIL import Image
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

PX = 100
ASCENT, DESCENT = 8, 3
MAGENTA = (255, 0, 255)
WHITE = (255, 255, 255)

# Extra glyphs, drawn here in the bitmap's style (rows from the band top, '#' = face).
EXTRA = {
    0x00B7: (2, ['', '', '', '', '', '#', '', '', '']),                       # middle dot
    0x2013: (4, ['', '', '', '', '', '###', '', '', '']),                     # en dash
    0x2014: (6, ['', '', '', '', '', '#####', '', '', '']),                   # em dash
    0x2026: (6, ['', '', '', '', '', '', '', '# # #', '']),                   # ellipsis
    0x2019: (2, ['', '', '#', '#', '', '', '', '', '']),                      # right single quote
    0x2018: (2, ['', '', '#', '#', '', '', '', '', '']),                      # left single quote
    0x201C: (4, ['', '', '# #', '# #', '', '', '', '', '']),                  # left double quote
    0x201D: (4, ['', '', '# #', '# #', '', '', '', '', '']),                  # right double quote
    0x00D7: (4, ['', '', '', '', '# #', ' # ', '# #', '', '']),               # multiplication sign
    0x00B0: (4, ['', '', '###', '# #', '###', '', '', '', '']),               # degree
    0x25C7: (6, ['', '', '  #  ', ' # # ', '#   #', ' # # ', '  #  ', '', '']),  # white diamond
    0x25C6: (6, ['', '', '  #  ', ' ### ', '#####', ' ### ', '  #  ', '', '']),  # black diamond
    0x2192: (6, ['', '', '', '   # ', '#####', '   # ', '', '', '']),          # right arrow
    0x2190: (6, ['', '', '', ' #   ', '#####', ' #   ', '', '', '']),          # left arrow
    0x2191: (4, ['', '', ' # ', '###', ' # ', ' # ', ' # ', ' # ', '']),       # up arrow
    0x2193: (4, ['', '', ' # ', ' # ', ' # ', ' # ', '###', ' # ', '']),       # down arrow
    0x00E9: (4, ['', ' # ', '', '###', '# #', '###', '#  ', '###', '']),      # e acute
}


def bands(im):
    w, h = im.size
    px = im.load()
    rows = [y for y in range(h) if all(px[x, y][:3] == MAGENTA for x in range(w))]
    return [(a + 1, b) for a, b in zip(rows, rows[1:]) if b - a > 1]


def cells(im, top, bottom):
    w, _ = im.size
    px = im.load()
    sep = [x for x in range(w) if all(px[x, y][:3] == MAGENTA for y in range(top, bottom))]
    out = []
    for a, b in zip(sep, sep[1:]):
        if b - a > 1:
            out.append((a + 1, b))
    return out


def glyph_from_pixels(pixels, advance):
    pen = TTGlyphPen(None)
    for (x, y) in pixels:      # y: rows from the band top
        x0, x1 = x * PX, (x + 1) * PX
        y1 = (ASCENT - y) * PX
        y0 = y1 - PX
        pen.moveTo((x0, y0))
        pen.lineTo((x0, y1))
        pen.lineTo((x1, y1))
        pen.lineTo((x1, y0))
        pen.closePath()
    return pen.glyph(), advance * PX


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else '../the-seeker/assets/font/PixelFont2.png')
    out = Path(__file__).resolve().parent.parent / 'assets' / 'fonts' / 'SeekerPixel.woff2'
    im = Image.open(src).convert('RGBA')
    px = im.load()
    codes = [range(32, 65), range(65, 96), range(96, 127)]
    glyphs, metrics, cmap = {}, {}, {}
    order = ['.notdef', 'space']
    empty = TTGlyphPen(None).glyph()
    glyphs['.notdef'], metrics['.notdef'] = empty, (400, 0)
    glyphs['space'], metrics['space'] = empty, (300, 0)
    cmap[32] = 'space'
    cmap[0xA0] = 'space'
    for (top, bottom), rng in zip(bands(im), codes):
        cs = cells(im, top, bottom)
        for (x0, x1), code in zip(cs, rng):
            if code == 32:
                continue      # the space is set above
            pixels = [(x - x0, y - top) for y in range(top, bottom) for x in range(x0, x1) if px[x, y][:3] == WHITE and px[x, y][3] > 0]
            name = f'uni{code:04X}'
            glyphs[name], adv = glyph_from_pixels(pixels, x1 - x0)
            metrics[name] = (adv, 0)
            cmap[code] = name
            order.append(name)
    for code, (adv, rows) in EXTRA.items():
        pixels = [(x, y) for y, row in enumerate(rows) for x, ch in enumerate(row) if ch == '#']
        name = f'uni{code:04X}'
        glyphs[name], a = glyph_from_pixels(pixels, adv)
        metrics[name] = (a, 0)
        cmap[code] = name
        order.append(name)

    fb = FontBuilder(PX * 10, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT * PX, descent=-DESCENT * PX)
    fb.setupNameTable({'familyName': 'Seeker Pixel', 'styleName': 'Regular',
                       'copyright': 'Adapted from The Seeker (PixelFont2), CC BY 4.0, https://github.com/TheSeekerGame/the-seeker'})
    fb.setupOS2(sTypoAscender=ASCENT * PX, sTypoDescender=-DESCENT * PX, sTypoLineGap=0,
                usWinAscent=ASCENT * PX, usWinDescent=DESCENT * PX, fsType=0)
    fb.setupPost()
    fb.font.flavor = 'woff2'
    fb.save(str(out))
    print(f'{out}: {len(order)} glyphs, {out.stat().st_size} bytes')


if __name__ == '__main__' and '--tektur' not in sys.argv and '--display' not in sys.argv:
    main()


# ------------------------------------------------------------------ Tektur, as pixels
# Headings use Tektur (The Seeker's typeface) rasterized at a fixed pixel size without
# smoothing, so they sit on the same pixel grid as everything else:
#
#     python3 tools/make_font.py --tektur assets/fonts/Tektur-Medium.ttf

EXTRA_CHARS = '·–—’‘“”×°é…'


def raster_font(ttf, size, out_name, family):
    from PIL import ImageFont, ImageDraw
    font = ImageFont.truetype(str(ttf), size)
    ascent, descent = font.getmetrics()
    order = ['.notdef', 'space']
    empty = TTGlyphPen(None).glyph()
    glyphs = {'.notdef': empty, 'space': empty}
    metrics = {'.notdef': (size * 50, 0), 'space': (round(font.getlength(' ')) * PX, 0)}
    cmap = {32: 'space', 0xA0: 'space'}
    chars = [chr(c) for c in range(33, 127)] + list(EXTRA_CHARS)
    for ch in chars:
        w = int(font.getlength(ch)) + 4
        im = Image.new('1', (w + 4, ascent + descent + 4), 0)
        d = ImageDraw.Draw(im)
        d.fontmode = '1'
        d.text((1, 1 + ascent), ch, font=font, fill=1, anchor='ls')
        px = im.load()
        pixels = []
        for y in range(im.height):
            for x in range(im.width):
                if px[x, y]:
                    pixels.append((x - 1, y - 1 - ascent))
        pen = TTGlyphPen(None)
        for (x, y) in pixels:      # y: rows from the baseline, down
            x0, x1 = x * PX, (x + 1) * PX
            y1 = -y * PX
            pen.moveTo((x0, y1 - PX))
            pen.lineTo((x0, y1))
            pen.lineTo((x1, y1))
            pen.lineTo((x1, y1 - PX))
            pen.closePath()
        name = f'uni{ord(ch):04X}'
        glyphs[name] = pen.glyph()
        metrics[name] = (round(font.getlength(ch)) * PX, 0)
        cmap[ord(ch)] = name
        order.append(name)
    fb = FontBuilder(PX * size, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ascent * PX, descent=-descent * PX)
    fb.setupNameTable({'familyName': family, 'styleName': 'Regular',
                       'copyright': 'Rasterized from Tektur (SIL Open Font License 1.1)'})
    fb.setupOS2(sTypoAscender=ascent * PX, sTypoDescender=-descent * PX, sTypoLineGap=0,
                usWinAscent=ascent * PX, usWinDescent=descent * PX, fsType=0)
    fb.setupPost()
    fb.font.flavor = 'woff2'
    out = Path(__file__).resolve().parent.parent / 'assets' / 'fonts' / out_name
    fb.save(str(out))
    print(f'{out}: {len(order)} glyphs, {out.stat().st_size} bytes')


if __name__ == '__main__' and '--tektur' in sys.argv:
    ttf = Path(sys.argv[sys.argv.index('--tektur') + 1])
    raster_font(ttf, 30, 'TekturPixel30.woff2', 'Tektur Pixel 30')


# ------------------------------------------------------------------ Seeker Display
# Headings: an uppercase display face drawn pixel by pixel in Tektur's manner (two-pixel
# stems, chamfered corners), nine pixels tall, for titles, names and numbers. Lowercase
# letters map to the capitals.
#
#     python3 tools/make_font.py --display

DISPLAY = {
    'A': ['.###.', '##.##', '##.##', '##.##', '#####', '##.##', '##.##', '##.##', '##.##'],
    'B': ['####.', '##.##', '##.##', '##.##', '####.', '##.##', '##.##', '##.##', '####.'],
    'C': ['.####', '##...', '##...', '##...', '##...', '##...', '##...', '##...', '.####'],
    'D': ['####.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '####.'],
    'E': ['#####', '##...', '##...', '##...', '####.', '##...', '##...', '##...', '#####'],
    'F': ['#####', '##...', '##...', '##...', '####.', '##...', '##...', '##...', '##...'],
    'G': ['.####', '##...', '##...', '##...', '##.##', '##.##', '##.##', '##.##', '.####'],
    'H': ['##.##', '##.##', '##.##', '##.##', '#####', '##.##', '##.##', '##.##', '##.##'],
    'I': ['##', '##', '##', '##', '##', '##', '##', '##', '##'],
    'J': ['...##', '...##', '...##', '...##', '...##', '...##', '##.##', '##.##', '.###.'],
    'K': ['##.##', '##.##', '##.##', '####.', '###..', '####.', '##.##', '##.##', '##.##'],
    'L': ['##...', '##...', '##...', '##...', '##...', '##...', '##...', '##...', '#####'],
    'M': ['##...##', '###.###', '#######', '##.#.##', '##...##', '##...##', '##...##', '##...##', '##...##'],
    'N': ['##..##', '###.##', '###.##', '######', '##.###', '##.###', '##..##', '##..##', '##..##'],
    'O': ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
    'P': ['####.', '##.##', '##.##', '##.##', '####.', '##...', '##...', '##...', '##...'],
    'Q': ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.#.', '.##.#'],
    'R': ['####.', '##.##', '##.##', '##.##', '####.', '##.##', '##.##', '##.##', '##.##'],
    'S': ['.####', '##...', '##...', '##...', '.###.', '...##', '...##', '...##', '####.'],
    'T': ['######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
    'U': ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
    'V': ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.', '..#..'],
    'W': ['##...##', '##...##', '##...##', '##...##', '##...##', '##.#.##', '#######', '###.###', '##...##'],
    'X': ['##.##', '##.##', '##.##', '.###.', '.###.', '.###.', '##.##', '##.##', '##.##'],
    'Y': ['##..##', '##..##', '##..##', '##..##', '.####.', '..##..', '..##..', '..##..', '..##..'],
    'Z': ['#####', '...##', '...##', '..###', '.###.', '###..', '##...', '##...', '#####'],
    '0': ['.###.', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '.###.'],
    '1': ['.##.', '###.', '.##.', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
    '2': ['.###.', '##.##', '...##', '...##', '..##.', '.##..', '##...', '##...', '#####'],
    '3': ['####.', '...##', '...##', '...##', '.###.', '...##', '...##', '...##', '####.'],
    '4': ['##.##', '##.##', '##.##', '##.##', '#####', '...##', '...##', '...##', '...##'],
    '5': ['#####', '##...', '##...', '##...', '####.', '...##', '...##', '...##', '####.'],
    '6': ['.####', '##...', '##...', '##...', '####.', '##.##', '##.##', '##.##', '.###.'],
    '7': ['#####', '...##', '...##', '...##', '..##.', '..##.', '.##..', '.##..', '.##..'],
    '8': ['.###.', '##.##', '##.##', '##.##', '.###.', '##.##', '##.##', '##.##', '.###.'],
    '9': ['.###.', '##.##', '##.##', '##.##', '.####', '...##', '...##', '...##', '####.'],
    ':': ['..', '..', '##', '##', '..', '..', '##', '##', '..'],
    '.': ['..', '..', '..', '..', '..', '..', '..', '##', '##'],
    ',': ['..', '..', '..', '..', '..', '..', '..', '##', '##', '.#'],
    '-': ['....', '....', '....', '....', '####', '....', '....', '....', '....'],
    '·': ['..', '..', '..', '..', '##', '..', '..', '..', '..'],
    '+': ['......', '......', '..##..', '..##..', '######', '..##..', '..##..', '......', '......'],
    '×': ['.....', '.....', '##.##', '.###.', '..#..', '.###.', '##.##', '.....', '.....'],
    '/': ['...##', '...##', '..##.', '..##.', '.##..', '.##..', '##...', '##...', '##...'],
    '%': ['##...##', '##..##.', '...##..', '...##..', '..##...', '..##...', '.##..##', '##...##', '.......'],
    '#': ['......', '.#..#.', '######', '.#..#.', '.#..#.', '######', '.#..#.', '......', '......'],
    '!': ['##', '##', '##', '##', '##', '##', '..', '##', '##'],
    '?': ['.###.', '##.##', '...##', '...##', '..##.', '.##..', '.....', '.##..', '.##..'],
    "'": ['##', '##', '..', '..', '..', '..', '..', '..', '..'],
    '’': ['##', '##', '..', '..', '..', '..', '..', '..', '..'],
    '"': ['##.##', '##.##', '.....', '.....', '.....', '.....', '.....', '.....', '.....'],
    '(': ['.##', '##.', '##.', '##.', '##.', '##.', '##.', '##.', '.##'],
    ')': ['##.', '.##', '.##', '.##', '.##', '.##', '.##', '.##', '##.'],
    '&': ['.##..', '##.#.', '##.#.', '.##..', '###.#', '##.##', '##.#.', '##.##', '.##.#'],
    '—': ['......', '......', '......', '......', '######', '......', '......', '......', '......'],
    '–': ['....', '....', '....', '....', '####', '....', '....', '....', '....'],
}


def display_font():
    cap = 9
    order = ['.notdef', 'space']
    empty = TTGlyphPen(None).glyph()
    glyphs = {'.notdef': empty, 'space': empty}
    metrics = {'.notdef': (500, 0), 'space': (3 * PX, 0)}
    cmap = {32: 'space', 0xA0: 'space'}
    for ch, rows in DISPLAY.items():
        pen = TTGlyphPen(None)
        w = max(len(r) for r in rows)
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c != '#':
                    continue
                y1 = (cap - y) * PX
                pen.moveTo((x * PX, y1 - PX))
                pen.lineTo((x * PX, y1))
                pen.lineTo(((x + 1) * PX, y1))
                pen.lineTo(((x + 1) * PX, y1 - PX))
                pen.closePath()
        name = f'uni{ord(ch):04X}'
        glyphs[name] = pen.glyph()
        metrics[name] = ((w + 1) * PX, 0)
        cmap[ord(ch)] = name
        order.append(name)
        if 'A' <= ch <= 'Z':
            cmap[ord(ch.lower())] = name
    fb = FontBuilder(PX * 11, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=cap * PX, descent=-2 * PX)
    fb.setupNameTable({'familyName': 'Seeker Display', 'styleName': 'Regular',
                       'copyright': 'Drawn for Soundings in the manner of Tektur and The Seeker'})
    fb.setupOS2(sTypoAscender=cap * PX, sTypoDescender=-2 * PX, sTypoLineGap=0,
                usWinAscent=cap * PX, usWinDescent=2 * PX, fsType=0)
    fb.setupPost()
    fb.font.flavor = 'woff2'
    out = Path(__file__).resolve().parent.parent / 'assets' / 'fonts' / 'SeekerDisplay.woff2'
    fb.save(str(out))
    print(f'{out}: {len(order)} glyphs, {out.stat().st_size} bytes')


if __name__ == '__main__' and '--display' in sys.argv:
    display_font()
