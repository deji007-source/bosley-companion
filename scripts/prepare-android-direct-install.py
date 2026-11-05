#!/usr/bin/env python3
"""Strip the cross-app Accessibility target finder from the direct-install Android variant."""
from pathlib import Path
import re

root = Path("android")
manifest = root / "app/src/main/AndroidManifest.xml"
text = manifest.read_text()
text, count = re.subn(
    r'\s*<service\b(?=[^>]*android:name="\.BosleyTargetAccessibilityService")[^>]*>.*?</service>',
    '',
    text,
    flags=re.DOTALL,
)
if count != 1:
    raise SystemExit(f"Expected exactly one Bosley Accessibility service declaration; found {count}.")
manifest.write_text(text)

plugin = root / "app/src/main/java/com/bosley/companion/BosleyOverlayPlugin.java"
source = plugin.read_text()
source, methods = re.subn(
    r'\s*@PluginMethod public void findGuideTarget\(PluginCall call\)\s*\{.*?\n\s*\}\s*(?=@PluginMethod public void stopGuide)',
    '\n',
    source,
    flags=re.DOTALL,
)
if methods != 1:
    raise SystemExit(f"Expected exactly one native findGuideTarget method; found {methods}.")
plugin.write_text(source)

for relative in (
    "app/src/main/java/com/bosley/companion/BosleyTargetAccessibilityService.java",
    "app/src/main/res/xml/bosley_accessibility_service.xml",
    "app/src/main/res/values/bosley_accessibility_strings.xml",
):
    path = root / relative
    if path.exists():
        path.unlink()

manifest_text = manifest.read_text()
plugin_text = plugin.read_text()
if "BosleyTargetAccessibilityService" in manifest_text or "BIND_ACCESSIBILITY_SERVICE" in manifest_text:
    raise SystemExit("Accessibility service declaration remains in the direct-install manifest.")
if "findGuideTarget" in plugin_text:
    raise SystemExit("Accessibility target-finder bridge remains in the direct-install plugin.")
print("Direct-install Android variant verified: no AccessibilityService declaration or native target-finder bridge.")
