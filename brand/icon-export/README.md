# ProPresenter Launcher — App Icon

Implementation-ready icon assets. The master is **vector** (`app-icon.svg`); everything
else is rendered from it, so re-export from the SVG if the artwork changes.

## Files

```
brand/
  app-icon.svg            ← vector master (1024×1024, transparent outside the squircle)
  icon-export/
    AppIcon-16…1024.png   ← flat PNG set (transparent corners)
    AppIcon.iconset/      ← macOS, ready for `iconutil`
    web/                  ← favicon / PWA / apple-touch
```

## macOS (.icns)

The `AppIcon.iconset/` folder is named per Apple's spec. Generate the `.icns`:

```sh
iconutil -c icns brand/icon-export/AppIcon.iconset -o AppIcon.icns
```

For an Xcode asset catalog, drop the PNGs into an `AppIcon` image set (1x/2x slots
match the file sizes: 16, 32, 64, 128, 256, 512, 1024).

## Windows (.ico)

Combine the PNGs (use 16, 32, 48, 64, 128, 256) with ImageMagick:

```sh
magick icon-export/AppIcon-16.png icon-export/AppIcon-32.png icon-export/web/favicon-48.png \
       icon-export/AppIcon-64.png icon-export/AppIcon-128.png icon-export/AppIcon-256.png AppIcon.ico
```

## Electron

- macOS build: `AppIcon.icns`
- Windows build: `AppIcon.ico`
- Linux / tray: `AppIcon-512.png` (or `512`/`256`)

## Web / PWA

```html
<link rel="icon" type="image/svg+xml" href="app-icon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="web/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="web/favicon-16.png">
<link rel="apple-touch-icon" sizes="180x180" href="web/apple-touch-icon-180.png">
```

Manifest: `web/icon-192.png` and `web/icon-512.png`.

## Notes

- The squircle is full-bleed. macOS Big Sur+ convention insets the rounded square inside a
  ~10% transparent margin; if you want that exact look, the SVG can be re-exported onto a
  padded canvas — ask and I'll generate a padded variant.
- Brand color: primary `#2f7bf6`, deep `#1352c4`. Icon corners are transparent in every PNG.
