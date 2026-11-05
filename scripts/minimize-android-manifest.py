#!/usr/bin/env python3
"""Create the least-privilege Android chat build; optional overlay/guide features stay out."""
from pathlib import Path
import xml.etree.ElementTree as ET

manifest = Path("android/app/src/main/AndroidManifest.xml")
if not manifest.is_file():
    raise SystemExit("Android manifest not found")
ET.register_namespace("android", "http://schemas.android.com/apk/res/android")
A = "{http://schemas.android.com/apk/res/android}"
tree = ET.parse(manifest)
root = tree.getroot()

# Keep microphone permission for user-initiated voice chat. The base build does
# not need accessibility, overlay, screen capture, or foreground services.
remove_permissions = {
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
    "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.CAMERA",
    "android.permission.READ_MEDIA_IMAGES",
    "android.permission.READ_MEDIA_VIDEO",
    "android.permission.READ_MEDIA_AUDIO",
}
for node in list(root.findall("uses-permission")) + list(root.findall("uses-permission-sdk-23")):
    if node.get(A + "name") in remove_permissions:
        root.remove(node)

app = root.find("application")
if app is None:
    raise SystemExit("Android application element missing")
for node in list(app.findall("service")):
    name = node.get(A + "name", "")
    if name.endswith("BosleyOverlayService") or name.endswith("BosleyTargetAccessibilityService"):
        app.remove(node)

tree.write(manifest, encoding="utf-8", xml_declaration=True)

# Fail closed if a sensitive capability accidentally remains in the merged manifest.
check = ET.parse(manifest).getroot()
remaining = {n.get(A + "name") for n in list(check.findall("uses-permission")) + list(check.findall("uses-permission-sdk-23"))}
for permission in remove_permissions:
    if permission in remaining:
        raise SystemExit(f"Unexpected permission remains: {permission}")
services = [n.get(A + "name", "") for n in check.find("application").findall("service")]
if any(x.endswith("BosleyOverlayService") or x.endswith("BosleyTargetAccessibilityService") for x in services):
    raise SystemExit("Optional overlay/accessibility service remains enabled")
if "android.permission.RECORD_AUDIO" not in remaining:
    raise SystemExit("Microphone permission missing from voice-chat build")
print("Least-privilege Android chat manifest verified.")
