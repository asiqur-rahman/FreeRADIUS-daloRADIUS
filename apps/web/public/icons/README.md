# PWA Icons

`icon.svg` is the source icon used to generate all PNG variants.

## Current files

| File | Size | Purpose |
|------|------|---------|
| `icon-192.png` | 192×192 | Standard + maskable (Android adaptive) |
| `icon-512.png` | 512×512 | Standard + maskable, splash screen |
| `icon.svg` | vector | Source artwork |

Both sizes are declared with `purpose: "any"` and `purpose: "maskable"` in the manifest.
This works but the icon will not fill the Android adaptive shape perfectly — see below to
generate proper maskable variants.

## Generating PNGs from the SVG source

```bash
# sharp-cli (fastest, no native deps)
npx sharp-cli -i icon.svg -o icon-192.png resize 192
npx sharp-cli -i icon.svg -o icon-512.png resize 512

# ImageMagick (brew install imagemagick / apt install imagemagick)
magick icon.svg -resize 192x192 icon-192.png
magick icon.svg -resize 512x512 icon-512.png

# Inkscape
inkscape icon.svg --export-filename=icon-192.png --export-width=192
inkscape icon.svg --export-filename=icon-512.png --export-width=512
```

## Generating proper maskable icons

Android adaptive icons fill a circle/squircle safe zone that is **80 %** of the icon canvas.
A maskable icon must have its important content within that inner 80 % and a full bleed
background that fills the entire 192×192 / 512×512 canvas.

Recommended workflow:

1. Open `icon.svg` in Figma / Inkscape.
2. Add a solid background layer (colour `#09090b`) that fills the full canvas.
3. Scale the logo mark down to ≤ 72 px within a 192 px canvas (≤ 38 %).
4. Export as `icon-192-maskable.png` (192×192) and `icon-512-maskable.png` (512×512).
5. Update `vite.config.ts` manifest entries:

```ts
{ src: "/icons/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
{ src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
```

Online tool: https://maskable.app/editor — paste the SVG, adjust safe zone, export PNGs.
