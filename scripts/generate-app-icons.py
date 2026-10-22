#!/usr/bin/env python3
"""Generate Bosley's black-and-white large-eyes application icons."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "assets" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

def render(size):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # Black rounded-square app tile, inset slightly to preserve rounded corners.
    pad = max(1, round(size * 0.035))
    radius = round(size * 0.23)
    draw.rounded_rectangle((pad, pad, size-pad-1, size-pad-1), radius=radius, fill=(0, 0, 0, 255))
    # Two tall, pupil-free white eyes: Bosley's signature incognito face.
    eye_w = max(2, round(size * 0.205))
    eye_h = max(4, round(size * 0.49))
    gap = round(size * 0.13)
    total = eye_w * 2 + gap
    left = (size - total) // 2
    top = (size - eye_h) // 2
    r = eye_w // 2
    draw.rounded_rectangle((left, top, left+eye_w, top+eye_h), radius=r, fill="white")
    right = left + eye_w + gap
    draw.rounded_rectangle((right, top, right+eye_w, top+eye_h), radius=r, fill="white")
    return image

# Windows installer icon.
render(256).save(ICON_DIR / "bosley.ico", format="ICO", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
# Android legacy launcher icon resources; Android applies the app mask.
android_res = ROOT / "android" / "app" / "src" / "main" / "res"
for density, size in {"mdpi":48, "hdpi":72, "xhdpi":96, "xxhdpi":144, "xxxhdpi":192}.items():
    folder = android_res / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    render(size).convert("RGB").save(folder / "ic_launcher.png", format="PNG")
# Keep a PNG preview/source in the repository build output too.
render(512).save(ICON_DIR / "bosley-icon.png", format="PNG")
print("Generated Bosley large-eyes icons for Windows and Android.")
