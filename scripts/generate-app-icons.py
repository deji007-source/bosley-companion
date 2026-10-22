#!/usr/bin/env python3
"""Generate Bosley's black tile / white eyes icons for Windows and Android."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "assets" / "icons"
ICON_DIR.mkdir(parents=True, exist_ok=True)

def render(size, background=True):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if background:
        pad = max(1, round(size * 0.035))
        draw.rounded_rectangle((pad, pad, size-pad-1, size-pad-1),
                               radius=round(size * 0.23), fill=(0, 0, 0, 255))
    eye_w = max(2, round(size * 0.205))
    eye_h = max(4, round(size * 0.49))
    gap = round(size * 0.13)
    left = (size - (eye_w * 2 + gap)) // 2
    top = (size - eye_h) // 2
    radius = eye_w // 2
    draw.rounded_rectangle((left, top, left+eye_w, top+eye_h), radius=radius, fill="white")
    right = left + eye_w + gap
    draw.rounded_rectangle((right, top, right+eye_w, top+eye_h), radius=radius, fill="white")
    return image

render(256).save(ICON_DIR / "bosley.ico", format="ICO",
                 sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

android_res = ROOT / "android" / "app" / "src" / "main" / "res"
# Legacy density resources remain available to older Android launchers.
for density, size in {"mdpi":48, "hdpi":72, "xhdpi":96, "xxhdpi":144, "xxxhdpi":192}.items():
    folder = android_res / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    render(size).convert("RGB").save(folder / "ic_launcher.png", format="PNG")
# Adaptive icons are preferred by Android 8+; explicitly generate them too.
for density, size in {"mdpi":108, "hdpi":162, "xhdpi":216, "xxhdpi":324, "xxxhdpi":432}.items():
    folder = android_res / f"mipmap-{density}"
    folder.mkdir(parents=True, exist_ok=True)
    render(size, background=False).save(folder / "ic_launcher_foreground.png", format="PNG")
    Image.new("RGB", (size, size), (0, 0, 0)).save(folder / "ic_launcher_background.png", format="PNG")
anydpi = android_res / "mipmap-anydpi-v26"
anydpi.mkdir(parents=True, exist_ok=True)
(anydpi / "ic_launcher.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '    <background android:drawable="@mipmap/ic_launcher_background" />\n'
    '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
    '</adaptive-icon>\n', encoding="utf-8")
# Also provide an explicit round adaptive icon for launchers that request it.
(anydpi / "ic_launcher_round.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '    <background android:drawable="@mipmap/ic_launcher_background" />\n'
    '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
    '</adaptive-icon>\n', encoding="utf-8")
render(512).save(ICON_DIR / "bosley-icon.png", format="PNG")
print("Generated Bosley Windows, legacy Android, and adaptive Android launcher icons.")
