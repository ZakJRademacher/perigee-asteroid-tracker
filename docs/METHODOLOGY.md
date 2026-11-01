# Position and trajectory methodology

## Encounter grain

The catalog counts predicted Earth close approaches. Each record is keyed by NASA ID and approach timestamp, so one asteroid can have more than one encounter record. Only Earth events are retained; repeated keys are deduplicated. Unknown sizes stay unknown. Invalid required distances, velocities or times are excluded and counted. Summary metrics/CSV use encounter records, and the distance filter explicitly refers to closest approach. A day filter selects encounter day independently of the position epoch.

## JPL source request

The same-origin `/api/ephemeris?id=SPK_ID&start=YYYY-MM-DD` endpoint requests NASA/JPL Horizons vectors. Only 7–10 digit numeric small-body IDs and valid supported dates are accepted. The destination is fixed; this is not an arbitrary URL proxy. `COMMAND=DES=SPK_ID;` resolves numeric small-body identity unambiguously. Reference center is Earth body center (`500@399`), reference system ICRF, reference plane ECLIPTIC/J2000, geometric correction NONE, and units KM-S. Input/output time scale is UT, corresponding to UTC for the supported modern dates. Start dates are limited to 1962–2099.

Each response supplies 1441 states over 60 days with a one-hour step. The JSON signature must be NASA/JPL Horizons API version 1.2, the verified live version. The parser checks Earth (399), J2000 ecliptic frame, geometric output, km/s units, UT header, finite position/velocity components, table boundaries, total coverage and increasing hourly timestamps. A changed version or unsupported payload is rejected for review. HTTP 200 error payloads are not treated as data.

Julian UT days convert to Unix milliseconds with JD 2440587.5 at Unix epoch. The output is rounded to milliseconds, and expected timestamps are checked within 5 ms to tolerate floating-point JD formatting. No object's missing vectors are replaced by a synthetic direction.

## Position and display transform

Every displayed point uses the same UTC epoch. Positions between adjacent JPL states use cubic Hermite interpolation with endpoint positions and velocities in km/s. With normalized interval u and interval dt in seconds:

`p(u) = (2u³−3u²+1)p0 + (u³−2u²+u)dt·v0 + (−2u³+3u²)p1 + (u³−u²)dt·v1`.

No extrapolation is allowed. This is an approximation between source samples; no general precision guarantee is made for arbitrary close encounters. Validation reproduces all supplied samples exactly, tests an independent cubic-motion case and checks withheld hourly JPL states against surrounding two-hour samples. The withheld-state result is specific to the retained 2010 AL30 fixture, not a universal error bound.

The base right-handed transform is `(scene X, scene Y, scene Z) = (JPL X, JPL Z, −JPL Y) / scaleKm`. Astronomy Engine then rotates this frame into the true equator of the current epoch, placing Earth's north along display +Y. The same orthogonal transform applies to Earth, sunlight, all asteroid positions and every selected path vertex; raw numeric details remain in J2000 ecliptic. The fixed current-epoch viewing frame is used for the entire path, so future points are not individually rotated into different date frames.

One uniform linear position scale applies to all points and the selected future path, preserving relative angles and distance ratios. The viewing sphere fixes the linear scale: radius in kilometers divided by 7.8 scene units. The selected path is clipped to this sphere. Radius changes are explicit; time scrubbing and selection do not refit the scale. One mean lunar distance is 384,400 km. Earth uses a 6,371 km mean radius on the same position scale (`referenceEarthRadius = 6371 / scaleKm`), not a radius inferred from catalog approaches. Asteroid markers are exaggerated for readability and use a separate screen-size encoding; their visible radii do not establish physical body-size ratios or collision risk. Opaque WebGL depth testing hides markers and path segments behind Earth; hidden DOM hit targets/labels cannot appear through the planet.

## Selected trajectory

The app starts with no selected object. Selecting a dot or catalog row draws that asteroid's next 30 days of Earth-relative positions, sampled hourly from the shared position epoch. The unclipped path starts at the same interpolated position as the dot and ends at epoch + 30 days, limited to available coverage. Displayed segments are clipped to the viewing sphere, so their endpoints can instead lie on that boundary. Clear selection, disabling the path checkbox or filtering out the selection removes the line. A different selection replaces it. Grid circles are reference range guides, not other asteroid orbits.

These are geometric geocentric trajectories: Earth is the origin at each sample time. They are not apparent telescope bearings (no light-time or aberration corrections), closed Earth satellite orbits, full solar orbits, impact probabilities or covariance envelopes. Changing time does not independently numerically integrate the bodies; it evaluates the sampled Horizons ephemeris. Live clock uses the current UTC time when it lies within the loaded window. Manual epoch edits pause live time; Now resumes it. Earth orientation, sunlight, asteroid positions and the selected path use that same epoch. For historical encounter windows, the initial epoch is noon on the first day rather than falsely labeling it current.

## Queue, cache and error handling

The browser queues all unique buffered candidates matching the filters, prioritizing explicit selection and likely nearby objects. JPL requests remain serial. IndexedDB reuses successful ID/start-date vectors for one hour from the source timestamp, with localStorage fallback. The backend deduplicates pending jobs and serializes upstream requests within the Worker instance. Its Cache API also retains successful vectors for an hour; memory keeps at most 64 object/window records. Source failures trigger backoff and a manual Retry positions control. The position source and one shared UTC epoch remain visible.

The live JPL source can revise orbital solutions. Source retrieval time and display epoch are distinct and shown separately. A dated example is used only while fresh under the same TTL. If JPL fails, the catalog remains usable and unavailable 3D points are omitted. The 2D schematic is separately labeled and never silently substituted into the physical 3D mode. Dates outside the supported ephemeris range retain their encounter catalog but have no fabricated positions.

## Media and publication

Reviewed image associations remain keyed to exact NASA IDs, with original credits, observation dates and source links. Radar imagery is labeled separately from optical photographs and composites. NASA library metadata matches stay unverified candidates; missing matches do not establish that no image exists elsewhere. Neither images nor Earth rotation are live camera feeds.

The current application is publicly hosted at [perigee.zakjrademacher.workers.dev](https://perigee.zakjrademacher.workers.dev/) on Cloudflare Workers. The deterministic Node build embeds the frontend into the generated Worker. Same-origin catalog and fixed-destination Horizons endpoints support the app. The catalog Worker reads a separately configured `NASA_API_KEY` environment secret, with `DEMO_KEY` as the code fallback; no key value belongs in committed source or browser responses. The README and deployment configuration describe the current public release. Earlier owner-private Sites hosting belongs to repository history and does not describe current access.

References: [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html), [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html), [JPL fair-use policy](https://ssd-api.jpl.nasa.gov/doc/index.php), [NeoWs](https://api.nasa.gov/), [NASA image library API](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf).

Earth rendering and diameter-based marker encoding are documented in [Earth orientation and markers](EARTH.md).

The viewing radius fixes the distance scale throughout scrubbing, loading and selection. Default: 100 LD; choices: 25, 50 and 100 LD. Earth's physical radius follows the same linear position scale. **Fit field** frames the current viewing sphere; **Reset view** restores the Earth-centered lunar view. The selected trajectory is clipped into independent line segments at the sphere boundary.

The encounter catalog uses seven serial NASA NeoWs requests for 44 days: 30 visible timeline days plus seven days on either side. Table and CSV retain only events in the timeline. The 3D field considers all unique buffered candidates and shows each only while its interpolated Earth-centered radius is within the selected sphere. Missing coordinates remain omitted; progress distinguishes loaded and unavailable candidates. Coverage is limited to this source catalog.

Clicking the selected asteroid or reference body again clears that selection. The explicit **Close** control also clears details and the selected asteroid path while retaining the panel space. There is no separate View settings preference controlling repeat-click behavior in the current interface.

While Live clock is enabled and the page is visible, the app checks once per minute whether the catalog refresh interval has elapsed. Background refresh preserves the selected object and scrub time for the same window. Likely nearby candidates are prioritized for downloads; the priority score never substitutes for JPL coordinates. IndexedDB stores successful vectors beyond localStorage's small string quota, with a one-hour source-timestamp expiry and graceful fallback if storage is unavailable. Existing marker meshes are reused, and decorative star redraws are limited to 20 frames per second without repeatedly projecting DOM marker labels.

## Documentation correction — November 1, 2026

This revision aligns scale, public hosting, catalog-secret handling and current selection controls with the existing implementation. It changes no numerical code, report behavior or deployed resources. Superseded explanations remain available in dated Git history.
