# Maintaining the Perigee interface

The interface uses installed Segoe UI and Arial fonts. Color and motion should help a reader follow the actual data and controls. Keep units, source credits, qualifications, and status labels visible.

Edit `design-tokens.json`, then run `python tools/build_theme.py` to update the palette in `dist/studio.css`. Component gradients and motion live in that stylesheet. Test keyboard focus, a 390-pixel viewport, empty and error states, and the reduced-motion preference.

Run the existing project tests, then the browser check:

```sh
python tools/check_visual_refresh.py --url <local URL> --evidence <new evidence folder> --workdir <scratch folder>
```

The browser check needs development Playwright and Edge support. Use new evidence folders to keep the earlier measurements intact. Run `node tools/build-worker.mjs` and restart the local preview after editing. The Worker embeds frontend files at build time; publication uses the existing Cloudflare configuration.

For practice, change one accent in a copy and rebuild. Check that the controls, downloads, counts, mobile layout, and explicit warning labels still work before accepting the change.

## Portfolio thumbnails

The shared cover uses a large title, a short tool line and a straight-on project screenshot. `presentation/cover.json` selects the existing source image and its scope label; `presentation/cover-template.html` controls the layout. `portfolio-cover.png` is the 1280 × 960 cover used on the GitHub profile and Upwork. `portfolio-cover-wide.png` is the 1280 × 720 variant. The repository README keeps its larger original report or app preview.

Run the existing `python presentation/build_cover.py --workdir <scratch folder>` to regenerate static covers after a source or title change. The template has no decorative entrance animation. Keep Perigee’s schematic label and the analytical source qualifications when changing a cover.
