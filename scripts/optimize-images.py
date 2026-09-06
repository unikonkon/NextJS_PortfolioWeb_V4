#!/usr/bin/env python3
"""Generate web-optimized copies of the source images in public/.

Sources (kept untouched):
  public/person1.jpg      -> public/photos/suthep-portrait.webp  (black backdrop keyed out)
  public/person.png       -> public/photos/suthep-outdoor.webp   (already transparent, resized)
  public/image1.jpg       -> public/photos/suthep-presenting.webp
  public/project/*.png    -> public/project-web/<name>.webp        (max 1600px, gallery)
                          -> public/project-web/thumbs/<name>.webp (max 720px, cards)

Only the project images referenced from data/personalProjects.ts are converted.
Run: python3 scripts/optimize-images.py   (needs Pillow with WebP support)
"""
from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'public'
PHOTOS = PUBLIC / 'photos'
PROJECT_WEB = PUBLIC / 'project-web'
THUMBS = PROJECT_WEB / 'thumbs'


def fit(image: Image.Image, max_side: int) -> Image.Image:
    scale = min(1.0, max_side / max(image.size))
    if scale >= 1.0:
        return image
    size = (round(image.width * scale), round(image.height * scale))
    return image.resize(size, Image.LANCZOS)


def key_black_backdrop(image: Image.Image, threshold: int = 34) -> Image.Image:
    """Turn the flat black backdrop of a flattened cut-out into transparency.

    A flood fill from the four corners marks only the background that is connected
    to the frame, so dark hair/clothing inside the silhouette is preserved.
    """
    rgb = image.convert('RGB')
    marker = (255, 0, 255)
    w, h = rgb.size
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if rgb.getpixel(seed) != marker:
            ImageDraw.floodfill(rgb, seed, marker, thresh=threshold)
    mask = Image.new('L', rgb.size, 255)
    pixels = rgb.load()
    mask_pixels = mask.load()
    for y in range(h):
        for x in range(w):
            if pixels[x, y] == marker:
                mask_pixels[x, y] = 0
    # Slightly erode + soften the edge so the JPEG fringe around the silhouette disappears.
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = image.convert('RGBA')
    out.putalpha(mask)
    return out


def save_webp(image: Image.Image, target: Path, quality: int = 82) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
    image.save(target, 'WEBP', quality=quality, method=6)
    print(f'{target.relative_to(ROOT)}  {image.width}x{image.height}  {target.stat().st_size // 1024} KB')


def portraits() -> None:
    portrait = Image.open(PUBLIC / 'person1.jpg')
    save_webp(fit(key_black_backdrop(portrait), 1200), PHOTOS / 'suthep-portrait.webp', quality=86)

    outdoor = Image.open(PUBLIC / 'person.png').convert('RGBA')
    save_webp(fit(outdoor, 1100), PHOTOS / 'suthep-outdoor.webp', quality=86)

    presenting = Image.open(PUBLIC / 'image1.jpg').convert('RGB')
    save_webp(fit(presenting, 1600), PHOTOS / 'suthep-presenting.webp', quality=80)


def referenced_project_images() -> list[str]:
    data = (ROOT / 'data' / 'personalProjects.ts').read_text(encoding='utf-8')
    return sorted(set(re.findall(r'"/project/([^"]+)"', data)))


def project_images() -> None:
    for name in referenced_project_images():
        source = PUBLIC / 'project' / name
        if not source.exists():
            print(f'skip (missing): {source}')
            continue
        stem = Path(name).stem
        with Image.open(source) as image:
            image.load()
            base = image.convert('RGBA') if image.mode == 'RGBA' else image.convert('RGB')
            if base.mode == 'RGBA' and base.getextrema()[3][0] == 255:
                base = base.convert('RGB')  # opaque screenshots do not need an alpha channel
            save_webp(fit(base, 1600), PROJECT_WEB / f'{stem}.webp', quality=80)
            save_webp(fit(base, 720), THUMBS / f'{stem}.webp', quality=78)


if __name__ == '__main__':
    portraits()
    project_images()
