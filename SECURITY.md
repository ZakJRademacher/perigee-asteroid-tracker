# Security policy

## Supported versions

Only the live site and the latest release get security fixes.

| Version | Supported |
| --- | --- |
| 1.x (latest) | Yes |
| Older | No |

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

1. Go to the repository's **Security** tab and choose **Report a vulnerability**. This opens a private advisory that only the maintainer can see.
2. Describe the problem, the affected page, API route or file, and how to reproduce it.

You should get a reply within 7 days. Once a fix is released, the advisory is published with credit to you, unless you'd rather stay anonymous.

## Scope

These are in scope:

- The live explorer at https://perigee.zakjrademacher.workers.dev/ and its Worker API, including script injection, request-limit bypasses and anything that could expose the Cloudflare credentials used by the refresh workflow.
- The third-party libraries the site uses.
- Secrets or private data committed to the repository, the GitHub Actions workflows, and pinned dependencies.

Out of scope are problems in NASA, JPL, CelesTrak, Wikimedia or Cloudflare themselves, and denial-of-service or load testing, which please don't run against the live site.
