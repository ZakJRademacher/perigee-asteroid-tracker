# Maintaining the presentation

Perigee / Observatory uses Segoe UI and Arial system fonts. No font files are distributed. The layered panels and restrained geometry frame real working results. Native data, validation and scientific calculations retain their existing definitions.

Edit `design-tokens.json`, then run `python tools/build_theme.py`. This updates the root palette in `dist/studio.css`. Component-specific gradients and motion live in that stylesheet. Keep data units, source credits, caveats and explicit status labels visible. Test keyboard focus, a 390-pixel viewport, empty/error states and reduced motion after a change. Do not animate invented numbers.

Run the existing project tests, then `python tools/check_visual_refresh.py --url <local URL> --evidence <new evidence folder> --workdir <scratch folder>`. Install Playwright and its Edge browser support in a development environment for that browser check. Use new evidence folders to preserve historical measurements.

Run `node tools/build-worker.mjs` and restart the local preview after edits; the Worker embeds the assets at build time. Deployment uses the existing Cloudflare configuration and URL.

Practice: change one brand accent in a disposable copy, rebuild, and explain why a warning or potentially hazardous classification must keep its explicit label. Accept the change only if controls, downloads, counts and mobile layout still work.
