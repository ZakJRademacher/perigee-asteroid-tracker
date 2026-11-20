# Changelog

Earlier releases are described in the git log.

## 1.5.0 (2026-11-20)

- Requests that would reach NASA or JPL are limited per visitor with the Workers rate-limiting binding: 10 new catalog dates a minute (`CATALOG_LIMITER`) and 300 new position sets a minute (more than a whole 30-day window, so a first visitor on an uncached day is never paused) (`ORBIT_LIMITER`). A position is only fetched from JPL for an object in that window's saved catalog. Saved answers are never limited. Over the budget, the API answers 429 with `retryAfter`, and the page pauses and resumes loading on its own. This stops one client from using up the upstream limits that every visitor depends on.
- The application, Worker, tests and tools are formatted with Prettier (no behaviour change).
- The footer shows the version.
