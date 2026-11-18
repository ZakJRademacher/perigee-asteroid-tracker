# Maintaining the Perigee interface

The interface is built around one full-screen 3D stage. A headline, a distance ladder, camera tools, a details drawer and a media-player-style time bar float over it in glass panels; the forecast and a two-tab catalog (asteroids and satellites) follow below. On screens narrower than 921 px the stage stays on top and the panels flow beneath it. Every selection opens the drawer with an **At a glance** tab in plain language and a **Deep dive** tab with the full numbers.

Headings use Space Grotesk (OFL, vendored by `tools/vendor_font.py` into `dist/vendor/fonts/` with its license and hash); body text uses Segoe UI or the system sans-serif. Color and motion should help a reader follow the actual data and controls. Keep units, source credits, qualifications, and status labels visible.

Edit `design-tokens.json`, then run `python tools/build_theme.py` to update the palette in `dist/stage.css`. All component styles, including the 3D overlay markers, live in that one stylesheet. Test keyboard focus, a 390-pixel viewport, empty and error states, and the reduced-motion preference.

Run the existing project tests. `tools/check_visual_refresh.py` was written for the previous layout and needs its selectors updated before it is used again:

```sh
python tools/check_visual_refresh.py --url <local URL> --evidence <new evidence folder> --workdir <scratch folder>
```

The browser check needs development Playwright and Edge support. Use new evidence folders to keep the earlier measurements intact. Run `node tools/build-worker.mjs` and restart the local preview after editing. The Worker embeds frontend files at build time; publication uses the existing Cloudflare configuration.


## Portfolio thumbnails

The shared cover uses a large title, a short tool line and a straight-on project screenshot. `presentation/cover.json` selects the existing source image and its scope label; `presentation/cover-template.html` controls the layout. `portfolio-cover.png` is the 1280 × 960 cover used on the GitHub profile and Upwork. `portfolio-cover-wide.png` is the 1280 × 720 variant. The repository README keeps its larger original report or app preview.

Run the existing `python presentation/build_cover.py --workdir <scratch folder>` to regenerate static covers after a source or title change. The template has no decorative entrance animation. Keep Perigee’s schematic label and the analytical source qualifications when changing a cover.
