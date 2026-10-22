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

One uniform linear position scale applies to all points and the selected future path, preserving relative angles and distance ratios. The viewing sphere fixes the linear scale: radius in kilometers divided by 7.8 scene units. The selected path is clipped to this sphere. Radius changes are explicit; time scrubbing and selection do not refit the scale. One mean lunar distance is 384,400 km. Earth and marker radii are enlarged independently; they cannot be used to infer collisions or physical size ratios. Earth's enlarged display radius uses the smallest candidate close-approach distance as a fixed reference for the loaded catalog and viewing radius. Opaque WebGL depth testing hides markers and path segments behind Earth; hidden DOM hit targets/labels cannot appear through the planet.

## Selected trajectory

No object is automatically selected at startup. Selecting a dot/catalog record creates only that object's next 30 days of Earth-relative positions, at one-hour intervals starting at the current position epoch. The unclipped path starts at the same interpolated position as the dot and ends at epoch + 30 days, limited to available coverage. Displayed segments are clipped to the viewing sphere, so their endpoints can instead lie on that boundary. Clear selection, disabling the path checkbox or filtering out the selection removes the line. A different selection replaces it. Grid circles are reference range guides, not other asteroid orbits.

These are geometric geocentric trajectories: Earth is the origin at each sample time. They are not apparent telescope bearings (no light-time or aberration corrections), closed Earth satellite orbits, full solar orbits, impact probabilities or covariance envelopes. Changing time does not independently numerically integrate the bodies; it evaluates the sampled Horizons ephemeris. Live clock uses the current UTC time when it lies within the loaded window. Manual epoch edits pause live time; Now resumes it. Earth orientation, sunlight, asteroid positions and the selected path use that same epoch. For historical encounter windows, the initial epoch is noon on the first day rather than falsely labeling it current.

## Queue, cache and error handling

The browser queues all unique buffered candidates matching the filters, prioritizing explicit selection and likely nearby objects. JPL requests remain serial. IndexedDB reuses successful ID/start-date vectors for one hour from the source timestamp, with localStorage fallback. The backend deduplicates pending jobs and serializes upstream requests within the Worker instance. Its Cache API also retains successful vectors for an hour; memory keeps at most 64 object/window records. Source failures trigger backoff and a manual Retry positions control. The position source and one shared UTC epoch remain visible.

The live JPL source can revise orbital solutions. Source retrieval time and display epoch are distinct and shown separately. A dated example is used only while fresh under the same TTL. If JPL fails, the catalog remains usable and unavailable 3D points are omitted. The 2D schematic is separately labeled and never silently substituted into the physical 3D mode. Dates outside the supported ephemeris range retain their encounter catalog but have no fabricated positions.

## Media and publication

Reviewed image associations remain keyed to exact NASA IDs, with original credits, observation dates and source links. Radar imagery is labeled separately from optical photographs and composites. NASA library metadata matches stay unverified candidates; missing matches do not establish that no image exists elsewhere. Neither images nor Earth rotation are live camera feeds.

The application now uses a Sites Worker rather than static-only hosting. Frontend assets are embedded unchanged into the generated Worker by the deterministic Node build, with the same Site ID and owner-private audience. The Worker exposes the fixed Horizons endpoint and serves the app; it uses no API secrets or user credentials.

References: [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html), [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html), [JPL fair-use policy](https://ssd-api.jpl.nasa.gov/doc/index.php), [NeoWs](https://api.nasa.gov/), [NASA image library API](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf).

Earth rendering and diameter-based marker encoding are documented in [Earth orientation and markers](EARTH.md).

The viewing radius fixes the distance scale throughout scrubbing, loading and selection. Default: 100 LD; choices: 25, 50 and 100 LD. Earth's enlarged radius is fixed from the candidate catalog for that viewing radius. **Fit field** and **Reset view** restore the camera. The selected trajectory is clipped into independent line segments at the sphere boundary.

The encounter catalog uses seven serial NASA NeoWs requests for 44 days: 30 visible timeline days plus seven days on either side. Table and CSV retain only events in the timeline. The 3D field considers all unique buffered candidates and shows each only while its interpolated Earth-centered radius is within the selected sphere. Missing coordinates remain omitted; progress distinguishes loaded and unavailable candidates. Coverage is limited to this source catalog.

The **View settings → Click again to close details** preference is enabled by default and saved in browser storage when available. Repeating a selection clears the details and path while keeping the panel space fixed. Disabling the preference retains the selection; the explicit Close and Clear selection controls remain available.

While Live clock is enabled and the page is visible, the app checks once per minute whether the catalog refresh interval has elapsed. Background refresh preserves the selected object and scrub time for the same window. Likely nearby candidates are prioritized for downloads; the priority score never substitutes for JPL coordinates. IndexedDB stores successful vectors beyond localStorage's small string quota, with a one-hour source-timestamp expiry and graceful fallback if storage is unavailable. Existing marker meshes are reused, and decorative star redraws are limited to 20 frames per second without repeatedly projecting DOM marker labels.
