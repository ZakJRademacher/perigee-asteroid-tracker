# Position and trajectory methodology

## Encounter grain

One catalog record is one asteroid's predicted Earth close approach: key = NASA ID + approach timestamp. Only Earth events are retained; repeated keys are deduplicated. Unknown sizes stay unknown. Invalid required distances, velocities or times are excluded and counted. Summary metrics/CSV use encounter records, and the distance filter explicitly refers to closest approach. A day filter selects encounter day independently of the position epoch.

## JPL source request

The same-origin `/api/ephemeris?id=SPK_ID&start=YYYY-MM-DD` endpoint requests NASA/JPL Horizons vectors. Only 7–10 digit numeric small-body IDs and valid supported dates are accepted. The destination is fixed; this is not an arbitrary URL proxy. `COMMAND=DES=SPK_ID;` resolves numeric small-body identity unambiguously. Reference center is Earth body center (`500@399`), reference system ICRF, reference plane ECLIPTIC/J2000, geometric correction NONE, and units KM-S. Input/output time scale is UT, corresponding to UTC for the supported modern dates. Start dates are limited to 1962–2099.

Each response supplies 1441 states over 60 days with a one-hour step. The JSON signature must be NASA/JPL Horizons API version 1.2, the verified live version. The parser checks Earth (399), J2000 ecliptic frame, geometric output, km/s units, UT header, finite position/velocity components, table boundaries, total coverage and increasing hourly timestamps. A changed version or unsupported payload is rejected for review. HTTP 200 error payloads are not treated as data.

Julian UT days convert to Unix milliseconds with JD 2440587.5 at Unix epoch. The output is rounded to milliseconds, and expected timestamps are checked within 5 ms to tolerate floating-point JD formatting. No object's missing vectors are replaced by a synthetic direction.

## Position and display transform

Every displayed point uses the same UTC epoch. Positions between adjacent JPL states use cubic Hermite interpolation with endpoint positions and velocities in km/s. With normalized interval u and interval dt in seconds:

`p(u) = (2u³−3u²+1)p0 + (u³−2u²+u)dt·v0 + (−2u³+3u²)p1 + (u³−u²)dt·v1`.

No extrapolation is allowed. This is an approximation between source samples; no general precision guarantee is made for arbitrary close encounters. Validation reproduces all supplied samples exactly, tests an independent cubic-motion case and checks withheld hourly JPL states against surrounding two-hour samples. The withheld-state result is specific to the retained 2010 AL30 fixture, not a universal error bound.

The base right-handed transform is `(scene X, scene Y, scene Z) = (JPL X, JPL Z, −JPL Y) / scaleKm`. Astronomy Engine then rotates this frame into the true equator of the current epoch, placing Earth's north along display +Y. The same orthogonal transform applies to Earth, sunlight, all asteroid positions and every selected path vertex; raw numeric details remain in J2000 ecliptic. The fixed current-epoch viewing frame is used for the entire path, so future points are not individually rotated into different date frames.

One uniform linear position scale applies to all points and the selected future path, preserving relative angles and distance ratios. The common extent fits current positions and the full 30-day trajectory. Scale changes are labeled. One mean lunar distance is 384,400 km. Earth and marker radii are enlarged independently; they cannot be used to infer collisions or physical size ratios. Earth's display radius shrinks if needed to keep the nearest positioned asteroid outside the enlarged globe. Opaque WebGL depth testing hides markers and path segments behind Earth; hidden DOM hit targets/labels cannot appear through the planet.

## Selected trajectory

No object is automatically selected at startup. Selecting a dot/catalog record creates only that object's next 30 days of Earth-relative positions, at one-hour intervals starting at the current position epoch. The first line vertex is the same interpolated position as the dot. The final vertex is the epoch + 30 days, limited to available coverage. Clear selection, disabling the path checkbox or filtering out the selection removes the line. A different selection replaces it. Grid circles are reference range guides, not other asteroid orbits.

These are geometric geocentric trajectories: Earth is the origin at each sample time. They are not apparent telescope bearings (no light-time or aberration corrections), closed Earth satellite orbits, full solar orbits, impact probabilities or covariance envelopes. Changing time does not independently numerically integrate the bodies; it evaluates the sampled Horizons ephemeris. Live clock uses the current UTC time when it lies within the loaded window. Manual epoch edits pause live time; Now resumes it. Earth orientation, sunlight, asteroid positions and the selected path use that same epoch. For historical encounter windows, the initial epoch is noon on the first day rather than falsely labeling it current.

## Queue, cache and error handling

The browser loads shown object IDs serially and prioritizes a new selection. Up to 60 marker objects are requested; a catalog selection outside that group replaces one slot. Browser cache is per ID/start date with a one-hour freshness check. The backend deduplicates same-key pending jobs and serializes upstream requests within the Worker instance. It uses an in-memory cache plus the platform Cache API when available, capped at one hour; memory keeps at most 200 windows. JPL requests include a product/version and the public GitHub profile as contact. HTTP errors/timeouts trigger backoff; the client stops its queue on service backoff and offers manual retry.

The live JPL source can revise orbital solutions. Source retrieval time and display epoch are distinct and shown separately. A dated example is used only while fresh under the same TTL. If JPL fails, the catalog remains usable and unavailable 3D points are omitted. The 2D schematic is separately labeled and never silently substituted into the physical 3D mode. Dates outside the supported ephemeris range retain their encounter catalog but have no fabricated positions.

## Media and publication

Reviewed image associations remain keyed to exact NASA IDs, with original credits, observation dates and source links. Radar imagery is labeled separately from optical photographs and composites. NASA library metadata matches stay unverified candidates; missing matches do not establish that no image exists elsewhere. Neither images nor Earth rotation are live camera feeds.

The application now uses a Sites Worker rather than static-only hosting. Frontend assets are embedded unchanged into the generated Worker by the deterministic Node build, with the same Site ID and owner-private audience. The Worker exposes the fixed Horizons endpoint and serves the app; it uses no API secrets or user credentials.

References: [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html), [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html), [JPL fair-use policy](https://ssd-api.jpl.nasa.gov/doc/index.php), [NeoWs](https://api.nasa.gov/), [NASA image library API](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf).

Earth rendering and diameter-based marker encoding are documented in [Earth orientation and markers](EARTH.md).

Framing is held steady while time is scrubbed: the reference scale covers the full loaded five-day catalog and selected trajectory coverage, and the enlarged Earth radius uses the catalog’s closest approach reference. New data does not continuously reframe the view. A newly selected trajectory refits once its data arrives. **Fit field** explicitly recalculates the fit; **Reset view** restores the camera angle. Filters preserve this reference scale.

The encounter catalog uses one validated NASA NeoWs request for a five-day window. Only Earth close approaches inside that UTC window are retained, including when a payload contains additional approach history. Incoming markers are prioritized by distance in time from their close-approach epoch, not by table sort order. Sixty-day Horizons coverage supports the whole window plus each 30-day selected path. Source failures preserve an explicitly dated fallback with its actual range. See EARTH.md for shared cache, rate-limit and coverage details.
