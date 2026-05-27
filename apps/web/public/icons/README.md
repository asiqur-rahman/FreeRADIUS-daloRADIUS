# PWA Icons

The `icon.svg` in this directory is the source icon.

For production you should generate proper PNG versions:

```bash
# Using Inkscape (if available):
inkscape icon.svg --export-png=icon-192.png --export-width=192
inkscape icon.svg --export-png=icon-512.png --export-width=512

# Using sharp (Node.js):
npx sharp-cli -i icon.svg -o icon-192.png resize 192
npx sharp-cli -i icon.svg -o icon-512.png resize 512

# Using ImageMagick:
magick icon.svg -resize 192x192 icon-192.png
magick icon.svg -resize 512x512 icon-512.png
```

Until PNG icons exist, vite-plugin-pwa will fall back to the favicon.svg.
The PWA is fully functional — icons are cosmetic.
