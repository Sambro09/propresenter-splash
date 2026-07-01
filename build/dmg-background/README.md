# DMG installer background

Artwork for the `.dmg` installer window — the "Water Caustics" direction: a dark
Deep Studio backdrop with a water surface, a base ripple under each icon, and the
standard drag-to-Applications layout with a wordmark and instruction line.

`dmg-background-water-caustics.html` is the **source of truth** — a pixel-accurate
660 × 400 pt render target. It is intentionally **icon-free**: the app icon and the
Applications alias are the real Finder-rendered icons that the DMG layout places on
top (positioned over the two recessed "wells" in the art).

## Regenerating the assets

```bash
node scripts/build-dmg-background.mjs   # or: npm run build:dmg-background
```

This rasterizes the HTML into the two PNGs one level up, which electron-builder
embeds in the DMG:

- `build/background.png` — 660 × 400 (@1x; its pixel size also sets the DMG window)
- `build/background@2x.png` — 1320 × 800 (@2x Retina)

At build time electron-builder combines them into a Retina TIFF automatically
(`tiffutil -cathidpicheck`), so both PNGs must stay checked in.

## Layout

The window size and icon placement are configured under `build.dmg` in
`package.json`. Icon **centers** (window coords, origin top-left) match the art's
wells: the app at (176, 176) and the Applications alias at (486, 176), icon size 128.
Keep these in sync with the wells in the HTML if the artwork geometry changes.
