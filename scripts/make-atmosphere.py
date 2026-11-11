#!/usr/bin/env python3
"""Draws the background art of the four chapters as small SVG files in src/assets/air/.

The files are the images behind the 3D scene (the `.atmo` layers in src/style.css): far hills with tree lines,
mountain ranges with snow caps, a sea of cloud, the Milky Way. Everything is flat shapes and gradients, in the
low-poly spirit of the scene, with no filters, so the browser rasterises each file once and only moves it afterwards.
Most files are tiles that repeat sideways without a seam: every curve is a sum of whole sine periods over the tile.
That also lets the page slide a tile sideways for ever (the wind in the sky chapter) with no jump where it wraps.

Run `python3 scripts/make-atmosphere.py` after changing a colour or a shape; the drawing is seeded, so the output
only changes when this file does.
"""
import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'air'


def n(value):
    """A short number for the SVG source."""
    text = f'{value:.1f}'.rstrip('0').rstrip('.')
    return text.replace('0.', '.', 1) if text.startswith(('0.', '-0.')) else text


def write(name, width, height, body, defs='', aspect=None, top=0):
    """Saves one drawing; `top` and `height` choose the strip of it that the file shows."""
    aspect = f' preserveAspectRatio="{aspect}"' if aspect else ''
    defs = f'<defs>{defs}</defs>' if defs else ''
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {top} {width} {height}"{aspect}>{defs}{body}</svg>\n'
    (OUT / name).write_text(svg, encoding='utf8')
    print(f'{name:22} {len(svg) / 1024:5.1f} KB')


def wave(rng, width, base, amplitudes):
    """A rolling line that repeats exactly every `width`: amplitude k belongs to k + 1 whole periods."""
    phases = [rng.uniform(0, math.tau) for _ in amplitudes]
    return lambda x: base + sum(a * math.sin(math.tau * (k + 1) * x / width + p) for k, (a, p) in enumerate(zip(amplitudes, phases)))


def land(line, width, height, step=16):
    """The area under a line, down to the bottom of the tile."""
    top = ' '.join(f'{n(x)} {n(line(x))}' for x in range(0, width + 1, step))
    return f'M{top} L{width} {height} 0 {height}Z'


def fade(name, top, bottom, y0, y1):
    return f'<linearGradient id="{name}" gradientUnits="userSpaceOnUse" x1="0" y1="{n(y0)}" x2="0" y2="{n(y1)}"><stop stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></linearGradient>'


def ground_hills():
    """Three lines of hills in morning haze, each with its tree line; two farmhouses and crop rows on the nearer ones."""
    rng = random.Random(11)
    width, height = 1600, 600
    far = wave(rng, width, 120, [26, 12, 7])
    mid = wave(rng, width, 205, [30, 16, 8, 4])
    near = wave(rng, width, 300, [34, 14, 6])
    defs = fade('a', '#e9edca', '#e3e9c0', 80, 260) + fade('b', '#d8e2b4', '#cfdba8', 160, 380) + fade('c', '#c8d8a0', '#bdd092', 250, 600)

    def trees(line, count, size, pine_share):
        rounds, pines, trunks = [], [], []
        for _ in range(count):
            x = rng.uniform(30, width - 30)
            y = line(x) + 1.5
            s = size * rng.uniform(0.7, 1.3)
            if rng.random() < pine_share:
                pines.append(f'M{n(x - s * 0.45)} {n(y)}l{n(s * 0.45)} {n(-s * 1.7)} {n(s * 0.45)} {n(s * 1.7)}z')
            else:
                rounds.append(f'<circle cx="{n(x)}" cy="{n(y - s * 0.95)}" r="{n(s * 0.62)}"/>')
                trunks.append(f'M{n(x - 0.8)} {n(y - s * 0.5)}h1.6v{n(s * 0.5)}h-1.6z')
        return ''.join(rounds) + f'<path d="{"".join(pines + trunks)}"/>'

    def house(x, line, s):
        y = line(x) + 2
        return (f'<path fill="#f3e9d0" d="M{n(x)} {n(y)}v{n(-s * 0.7)}h{n(s)}v{n(s * 0.7)}z"/>'
                f'<path fill="#d9b48e" d="M{n(x - s * 0.15)} {n(y - s * 0.7)}l{n(s * 0.65)} {n(-s * 0.5)} {n(s * 0.65)} {n(s * 0.5)}z"/>')

    rows = ''.join(f'<path d="M{" ".join(f"{n(x)} {n(near(x) + offset + offset * 0.12 * math.sin(math.tau * x / width))}" for x in range(0, width + 1, 32))}"/>' for offset in (34, 62, 96, 138))
    body = (f'<path fill="url(#a)" d="{land(far, width, height)}"/><g fill="#dbe4b7">{trees(far, 46, 7, 0.2)}</g>'
            f'<path fill="url(#b)" d="{land(mid, width, height)}"/>{house(420, mid, 15)}{house(1130, mid, 12)}<g fill="#c3d29b">{trees(mid, 40, 11, 0.45)}</g>'
            f'<path fill="url(#c)" d="{land(near, width, height)}"/><g fill="none" stroke="#b5c98b" stroke-width="2" opacity=".7">{rows}</g>'
            f'<g fill="#b0c686">{trees(near, 26, 17, 0.5)}</g>')
    write('ground-hills.svg', width, height, body, defs)


def cumulus(rng, x, base, puffs, radius):
    """Circles standing on a flat base line: one fair-weather cloud."""
    out = []
    for index in range(puffs):
        u = index / (puffs - 1)
        r = radius * (0.55 + 0.6 * math.sin(math.pi * u)) * rng.uniform(0.85, 1.15)
        out.append((x + (u - 0.5) * puffs * radius * 0.85, base - r * 0.35, r))
    return out


def ground_clouds():
    """A few small flat-bottomed clouds for the morning sky."""
    rng = random.Random(5)
    width, height = 1500, 240
    defs, body = '', ''
    for index, (x, base, puffs, radius) in enumerate([(210, 96, 5, 30), (640, 170, 6, 38), (1010, 78, 4, 24), (1290, 150, 5, 32)]):
        circles = ''.join(f'<circle cx="{n(cx)}" cy="{n(cy)}" r="{n(r)}"/>' for cx, cy, r in cumulus(rng, x, base, puffs, radius))
        defs += f'<clipPath id="k{index}"><rect width="{width}" height="{base}"/></clipPath>'
        body += f'<g clip-path="url(#k{index})" fill="#fffdf4" opacity="{n(rng.uniform(0.62, 0.8))}">{circles}</g>'
    write('ground-clouds.svg', width, height, body, defs)


def mountain_ridges():
    """Two snow-capped ranges with sunlit faces and a forested foothill, each fading into the haze of its valley."""
    rng = random.Random(23)
    width, height = 1600, 640
    haze = '#f6d7ae'
    defs = fade('a', '#e2b897', haze, 60, 330) + fade('b', '#cb9d86', '#efcaa2', 150, 470) + fade('c', '#bb927c', '#e3b993', 330, 640)

    def peaks(count, crest, reach, valley):
        """Peak and valley points of a range, with a rough point on every slope; starts and ends on the same valley."""
        points = [(0.0, valley)]
        span = width / count
        for index in range(count):
            px = span * (index + rng.uniform(0.38, 0.62))
            py = crest - rng.uniform(0.25, 1) * reach
            last_x, last_y = points[-1]
            points.append(((last_x + px) / 2 + rng.uniform(-12, 12), (last_y + py) / 2 + rng.uniform(-14, 6)))
            points.append((px, py))
            end = (span * (index + 1), valley + rng.uniform(-18, 18) if index < count - 1 else valley)
            points.append(((px + end[0]) / 2 + rng.uniform(-12, 12), (py + end[1]) / 2 + rng.uniform(-14, 6)))
            points.append(end)
        return points

    def mountain_range(points, fill, snow):
        d = 'M' + ' '.join(f'{n(x)} {n(y)}' for x, y in points) + f' L{width} {height} 0 {height}Z'
        caps, faces = [], []
        for index in range(2, len(points) - 2, 4):
            (lx, ly), (px, py), (rx, ry) = points[index - 1], points[index], points[index + 1]
            # The face that looks at the sun (upper right of the view) is a shade lighter.
            faces.append(f'M{n(px)} {n(py)}L{n(rx)} {n(ry)} {n(px + (rx - px) * 0.25)} {n(ry + 26)}Z')
            if snow:
                f = snow
                left, right = (px + (lx - px) * f, py + (ly - py) * f), (px + (rx - px) * f, py + (ry - py) * f)
                teeth = ' '.join(f'{n(right[0] + (left[0] - right[0]) * t)} {n(right[1] + (left[1] - right[1]) * t + (9 if step % 2 else -5))}' for step, t in enumerate((0.25, 0.5, 0.75)))
                caps.append(f'M{n(left[0])} {n(left[1])}L{n(px)} {n(py)} {n(right[0])} {n(right[1])} {teeth}Z')
        cap = f'<path fill="#fff8ea" opacity=".9" d="{"".join(caps)}"/>' if caps else ''
        return f'<path fill="{fill}" d="{d}"/><path fill="#fff" opacity=".13" d="{"".join(faces)}"/>{cap}'

    foothill = wave(rng, width, 372, [22, 12, 6, 4])
    pines = []
    x = 6.0
    while x < width - 6:
        size = rng.uniform(7, 13)
        y = foothill(x) + 3
        pines.append(f'M{n(x - size * 0.5)} {n(y)}l{n(size * 0.5)} {n(-size * 2.1)} {n(size * 0.5)} {n(size * 2.1)}z')
        x += rng.uniform(7, 15)
    body = (mountain_range(peaks(5, 150, 110, 215), 'url(#a)', 0.42) + mountain_range(peaks(4, 255, 120, 330), 'url(#b)', 0.3)
            + f'<path fill="url(#c)" d="{land(foothill, width, height)}{"".join(pines)}"/>')
    write('mountain-ridges.svg', width, height, body, defs)


def wisps():
    """Soft flat streaks of cloud: the high cirrus of the sky chapter and the valley mist of the mountain."""
    rng = random.Random(3)
    width, height = 1600, 400
    defs = '<radialGradient id="w"><stop stop-color="#fff" stop-opacity=".62"/><stop offset=".55" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
    body = ''
    for _ in range(18):
        x, y = rng.uniform(0, width), rng.uniform(50, height - 50)
        rx, ry, turn = rng.uniform(130, 400), rng.uniform(9, 26), rng.uniform(-4, 4)
        # A streak that crosses an edge of the tile is drawn again on the other side, so the tile has no seam.
        for copy in (x, x - width, x + width):
            if -rx < copy < width + rx:
                body += f'<ellipse cx="{n(copy)}" cy="{n(y)}" rx="{n(rx)}" ry="{n(ry)}" transform="rotate({n(turn)} {n(copy)} {n(y)})"/>'
    write('wisps.svg', width, height, f'<g fill="url(#w)">{body}</g>', defs)


def sky_clouds():
    """A sea of cloud in three depths, lit from above, with two cumulus towers. It is saved as two strips of one
    drawing, the two far banks and the near one, so the page can blow them along at different speeds."""
    rng = random.Random(8)
    width, height = 1600, 520

    def bank(level, small, large, fill, towers=()):
        circles = []
        x = 0.0
        while x < width:
            r = rng.uniform(small, large)
            circles.append((x, level + rng.uniform(-10, 14), r))
            x += r * rng.uniform(0.75, 1.15)
        for tx in towers:
            # A tower is a heap: each row has one puff fewer than the row below it.
            for row in range(4):
                r = large * (1.05 - row * 0.14)
                for column in range(4 - row):
                    circles.append((tx + (column - (3 - row) / 2) * r * 1.25 + rng.uniform(-8, 8), level - row * large * 0.78 + rng.uniform(-6, 6), r * rng.uniform(0.9, 1.1)))
        marks = ''
        for cx, cy, r in circles:
            for copy in (cx, cx - width, cx + width):
                if -r < copy < width + r:
                    marks += f'<circle cx="{n(copy)}" cy="{n(cy)}" r="{n(r)}"/>'
        return f'<g fill="{fill}">{marks}<rect y="{n(level)}" width="{width}" height="{n(height - level)}"/></g>'

    far = bank(170, 22, 44, 'url(#a)') + bank(265, 34, 66, 'url(#b)', towers=(560, 1290))
    near = bank(385, 52, 98, 'url(#c)')
    # src/style.css places the two strips by these numbers (`.cloud-far`, `.cloud-sea`).
    write('sky-clouds-far.svg', width, 450, far, fade('a', '#f3f8ff', '#cfe2f6', 95, 290) + fade('b', '#ffffff', '#d6e7f8', 150, 410))
    write('sky-clouds.svg', width, 250, near, fade('c', '#ffffff', '#e2eefa', 250, 520), top=270)


def sky_fliers():
    """The small things that move through the sky chapter, each in its own file because each moves by itself: a far
    airliner on its vapour trail, two hot-air balloons, and the fan of sun rays (the sun is the top left corner)."""
    trail = '<linearGradient id="t"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity=".95"/></linearGradient>'
    jet = ('<rect y="5" width="285" height="2" rx="1" fill="url(#t)"/><g fill="#fff"><ellipse cx="291" cy="6" rx="8.5" ry="1.6"/>'
           '<path d="M284.5 6l-2.6-4.4h2.6l3.6 4.4zM291 6l-5.4 4.6h2.8l6.8-4.6z"/></g>')
    write('sky-jet.svg', 300, 12, jet, trail)

    for name, colour in (('a', '#e39b78'), ('b', '#e9c46a')):
        x, y, s = 10, 11, 10
        balloon = (f'<path stroke="#8d7460" stroke-width=".6" d="M{n(x - s * 0.5)} {n(y + s * 0.7)}L{n(x - s * 0.2)} {n(y + s * 1.55)}M{n(x + s * 0.5)} {n(y + s * 0.7)}L{n(x + s * 0.2)} {n(y + s * 1.55)}"/>'
                   f'<ellipse cx="{x}" cy="{y}" rx="{n(s * 0.82)}" ry="{s}" fill="{colour}"/><ellipse cx="{x}" cy="{y}" rx="{n(s * 0.3)}" ry="{s}" fill="#f6e6cc"/>'
                   f'<rect x="{n(x - s * 0.24)}" y="{n(y + s * 1.5)}" width="{n(s * 0.48)}" height="{n(s * 0.36)}" fill="#9a7756"/>')
        write(f'sky-balloon-{name}.svg', 20, 31, balloon)

    size = 400
    glow = f'<radialGradient id="r" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="{size}"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
    rays = ''
    for angle, spread in ((10, 2.6), (24, 4.2), (39, 2.2), (53, 3.8), (68, 2.8), (80, 1.8)):
        a, b = math.radians(angle - spread), math.radians(angle + spread)
        rays += f'M0 0L{n(size * 1.5 * math.cos(a))} {n(size * 1.5 * math.sin(a))} {n(size * 1.5 * math.cos(b))} {n(size * 1.5 * math.sin(b))}Z'
    write('sky-rays.svg', size, size, f'<path fill="url(#r)" d="{rays}"/>', glow)


STAR_COLOURS = ['#ffffff', '#dce8ff', '#ffe9c9', '#cfe0ff']


def star_paths(stars):
    """Many tiny stars as a handful of paths: one per colour and brightness, each star a small diamond."""
    groups = {}
    for x, y, size, colour, alpha in stars:
        h = size * 0.62
        groups.setdefault((colour, alpha), []).append(f'M{round(x)} {round(y)}l{n(h)} {n(h)} {n(-h)} {n(h)} {n(-h)} {n(-h)}z')
    return ''.join(f'<path fill="{colour}" opacity="{alpha}" d="{"".join(marks)}"/>' for (colour, alpha), marks in sorted(groups.items()))


def space_band():
    """The Milky Way: a diagonal river of faint stars with a warm core, cool edges and two dark dust lanes."""
    rng = random.Random(42)
    width, height = 1600, 1000
    turn = math.degrees(math.atan2(-760, width))
    cx, cy = width / 2, height / 2
    stars = []
    while len(stars) < 900:
        along, across = rng.uniform(-1050, 1050), rng.gauss(0, 95)
        a = math.radians(turn)
        x, y = cx + along * math.cos(a) - across * math.sin(a), cy + along * math.sin(a) + across * math.cos(a)
        if 0 <= x < width and 0 <= y < height:
            stars.append((x, y, rng.choice([0.9, 1.1, 1.4, 1.9]), rng.choice(STAR_COLOURS), rng.choice(['.3', '.5', '.8'])))
    defs = ('<radialGradient id="g"><stop stop-color="#ffe7c4" stop-opacity=".26"/><stop offset=".5" stop-color="#b9c4ff" stop-opacity=".1"/><stop offset="1" stop-color="#8fa8ff" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="p"><stop stop-color="#d07ab8" stop-opacity=".2"/><stop offset="1" stop-color="#d07ab8" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="d"><stop stop-color="#070b1c" stop-opacity=".34"/><stop offset="1" stop-color="#070b1c" stop-opacity="0"/></radialGradient>')
    body = (f'<g transform="rotate({n(turn)} {cx} {cy})"><ellipse cx="{cx}" cy="{cy}" rx="1100" ry="210" fill="url(#g)"/>'
            f'<ellipse cx="{cx - 260}" cy="{cy + 30}" rx="420" ry="120" fill="url(#p)"/><ellipse cx="{cx + 380}" cy="{cy - 40}" rx="360" ry="90" fill="url(#p)"/>'
            f'<ellipse cx="{cx - 120}" cy="{cy - 14}" rx="520" ry="38" fill="url(#d)"/><ellipse cx="{cx + 430}" cy="{cy + 26}" rx="330" ry="28" fill="url(#d)"/></g>'
            + star_paths(stars))
    write('space-band.svg', width, height, body, defs, aspect='xMidYMid slice')


def space_stars():
    """The star field of the whole sky: scattered, in three colours and sizes, with a few bright ones."""
    rng = random.Random(77)
    size = 900
    stars = [(rng.uniform(0, size - 2), rng.uniform(0, size - 2), rng.choice([1, 1.2, 1.5, 2.1]), rng.choice(STAR_COLOURS), rng.choice(['.35', '.6', '.9'])) for _ in range(190)]
    bright = ''
    for _ in range(9):
        x, y, r = rng.uniform(20, size - 20), rng.uniform(20, size - 20), rng.uniform(1.3, 2)
        bright += f'<circle cx="{n(x)}" cy="{n(y)}" r="{n(r * 3.2)}" fill="#cfe0ff" opacity=".14"/><circle cx="{n(x)}" cy="{n(y)}" r="{n(r)}" fill="#fff"/>'
    write('space-stars.svg', size, size, star_paths(stars) + bright)


def space_twinkle():
    """Bright stars with a four-point flare; the layer that carries them fades in and out."""
    rng = random.Random(9)
    size = 720
    body = ''
    for _ in range(6):
        x, y, s = rng.uniform(40, size - 40), rng.uniform(40, size - 40), rng.uniform(4.5, 10)
        w = s * 0.13
        body += (f'<circle cx="{n(x)}" cy="{n(y)}" r="{n(s * 0.9)}" fill="url(#h)"/>'
                 f'<path fill="#fff" d="M{n(x)} {n(y - s)}L{n(x + w)} {n(y)} {n(x)} {n(y + s)} {n(x - w)} {n(y)}ZM{n(x - s)} {n(y)}L{n(x)} {n(y - w)} {n(x + s)} {n(y)} {n(x)} {n(y + w)}Z"/>')
    defs = '<radialGradient id="h"><stop stop-color="#dfeaff" stop-opacity=".55"/><stop offset="1" stop-color="#dfeaff" stop-opacity="0"/></radialGradient>'
    write('space-twinkle.svg', size, size, body, defs)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for draw in (ground_hills, ground_clouds, mountain_ridges, wisps, sky_clouds, sky_fliers, space_band, space_stars, space_twinkle):
        draw()

