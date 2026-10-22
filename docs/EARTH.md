# Earth orientation and asteroid marker sizes

## Earth imagery

The 3D globe uses unmodified, locally served NASA textures:

- Surface: [Blue Marble](https://science.nasa.gov/resource/blue-marble/), NASA/GSFC, Reto Stöckli. Historical composite published in 2002.
- Clouds: [Blue Marble with clouds](https://svs.gsfc.nasa.gov/2709/), NASA/GSFC, Reto Stöckli. Historical composite published in 2002.
- Night lights: [Earth at Night 2012](https://svs.gsfc.nasa.gov/30028/), NASA Earth Observatory image by Robert Simmon; Suomi NPP VIIRS data courtesy Chris Elvidge, NOAA NGDC. Data from April and October 2012.

These images are static historical composites. They do not portray current clouds, seasons, fires or city-light activity. Cloud features remain fixed to this globe; there is no synthetic weather animation. Surface, clouds and city lights share the same equirectangular geographic registration. Daylight/terminator and atmospheric rim are rendered effects. Missing texture requests leave a basic surface and an explicit partial-imagery note.

Exact download URLs, original-byte SHA-256 and credits are in `dist/assets/provenance.json`. `python tools/vendor_earth.py` fetches the original files and verifies the pinned astronomy package against its npm integrity value.

## Time and reference frame

[Astronomy Engine 2.1.19](https://github.com/cosinekitty/astronomy/blob/master/source/js/README.md) is vendored unchanged with its MIT notice. Its `ObserverVector(date, observer, false)` supplies Earth-fixed directions in J2000 equatorial coordinates, including Earth rotation, precession and nutation. Greenwich, north and 90° east define an orthonormal basis. `Rotation_EQJ_ECL` converts this basis into J2000 ecliptic, then the existing renderer mapping `(X, Z, -Y)` is applied.

The complete scene is then rotated into the true equatorial frame of the shared epoch with `Rotation_ECL_EQD`. Earth north becomes display +Y. Asteroids, the whole future trajectory, Earth and sunlight receive this identical rotation, preserving their relative geometry. The reference rings represent the equatorial plane, and the default camera sits about 4.7° above that plane. Camera dragging changes the viewing angle; Reset view restores this equatorial perspective. Raw coordinate readouts retain J2000 ecliptic values.

Three.js sphere UV registration maps longitude 0° to local +X, north to +Y and 90° east to −Z. A basis matrix sets the globe quaternion directly at the requested epoch. It is never advanced by an arbitrary animation speed or elapsed frame count. `GeoVector('Sun', date, false)` supplies the Earth-relative Sun direction, converted through the same frames, to light the day/night boundary. `SiderealTime` provides Greenwich apparent sidereal time for verification.

The selected UTC epoch is shared with the JPL asteroid positions and path. **Live clock** updates it once per second when the current time is in the loaded window. Changing the time field or slider pauses live time. **Now** resumes it or loads today's window. Hidden tabs suspend clock work, and rejoining the tab catches up to the current UTC time. Historical/future windows start fixed. Background animation only changes the star-field appearance and cannot alter Earth orientation.

This educational globe uses UTC as the Earth-rotation time input, without ingesting measured UT1−UTC or polar-motion corrections. It is not a full ITRF realization, a telescope-pointing solution or an impact/geolocation tool. No sub-arcsecond orientation accuracy is claimed. The globe and markers are enlarged relative to asteroid distances, so a dot overlapping Earth on screen does not indicate an atmospheric encounter or impact. The 2D schematic retains its illustrated Earth and decorative bearings.

## Diameter encoding

When both NASA diameter bounds are finite, positive and ordered, use their arithmetic midpoint `d` in metres. The marker diameter in screen pixels is:

```
pixels = clamp(4 + 0.65 × sqrt(d), 5, 30)
```

The fixed scale is monotonic, compresses differences across metre-to-kilometre estimates, and is stable across filtering, selection and distance. Very small/large sizes share the floor/cap. It is not a linear physical-size ratio. Tooltips and accessible labels report the actual estimated range. No bounds, zero, reversed or malformed bounds produce a hollow 9-pixel unknown marker, not an invented diameter. The same function serves the 2D and 3D views.

The 3D proxy's radius compensates for camera depth, vertical field of view and viewport height so perspective does not introduce a second size encoding. Selection changes emphasis and adds a ring; it does not inflate the size core. Pointer targets remain 44 pixels for usability. Markers represent generic objects, not resolved asteroid shapes.

## Validation

The Earth tests check the standard J2000 Greenwich sidereal anchor near 280.46°, approximately 23.44° obliquity, eastward rotation, a complete rotation in about 86,164.09 seconds, and the extra roughly 0.986° after a solar day. Other checks verify a right-handed orthonormal surface basis across 1962–2099, geographic UV directions without mirroring, equinox/solstice solar declinations and opposite noon/midnight illumination. Unsupported dates fail rather than retaining a stale globe.

Marker tests cover monotonicity, floors/caps, missing/malformed estimates and independence from selection/distance. Source hashes and the runtime license are checked. Browser checks cover texture loading, shader compilation, epoch changes, live/pause controls, selection/path consistency and matching visible size cores.

## Solid objects and extended trajectories

Markers are opaque depth-tested WebGL meshes. Their DOM elements provide interaction, labels and a selection ring, while duplicate CSS cores stay hidden in 3D. Unknown sizes use a hollow torus. Earth writes to the depth buffer; markers and path segments behind its surface are hidden. A camera-to-marker segment/sphere test also hides behind-Earth pointer targets and labels. Earth's display radius can shrink with the current distance scale to avoid swallowing nearby asteroid positions; it remains deliberately exaggerated. The atmospheric rim is transparent by design.

The selected path now extends 30 days from the shared epoch. JPL supplies 1441 hourly position/velocity states across 60 days to cover the entire 30-day encounter window plus the full projection. The path has 721 vertices including its initial and final points. Old 14-day caches are rejected and separate browser/Worker cache keys prevent using incomplete coverage. The retained real 60-day response is in tests/fixtures/horizons-2010al30-60d.json; the former response remains as a regression case for rejecting short coverage. This remains an Earth-relative predicted track rather than a complete solar orbit.

Framing is held steady while time is scrubbed: the reference scale covers the full loaded 30-day catalog and selected trajectory coverage, and the enlarged Earth radius uses the catalog’s closest approach reference. New data does not continuously reframe the view. A newly selected trajectory refits once its data arrives. **Fit field** explicitly recalculates the fit; **Reset view** restores the camera angle. Filters preserve this reference scale.

## Thirty-day encounter catalog

The catalog requests 30 calendar days through the same-origin `/api/catalog` endpoint. Five serial NeoWs batches each cover at most seven inclusive days. The combined response is published only if every batch succeeds; partial results never masquerade as a complete month. A bounded shared Worker cache and browser cache reuse the original retrieval timestamp for at most one hour. The Worker deduplicates concurrent catalog loads and backs off after a NASA rate limit. An optional `NASA_API_KEY` Worker secret replaces the public demo key; it is never sent to the browser. The date-labeled fallback retains its actual saved coverage, including shorter coverage when a complete new month cannot be retrieved.

At most 60 encounters nearest the position epoch are prioritized for the 3D field. As the time slider advances, later encounters enter that set and their Horizons data is queued. A selected object remains included. The table and CSV retain all matching catalog events. These are encounters already known to NASA when retrieved; newly discovered/revised entries enter after a successful source refresh, subject to the one-hour cache. This does not claim all asteroids anywhere in space are tracked.

Horizons now supplies 60 days of hourly states: 1441 samples cover every time in the 30-day catalog plus a complete selected 30-day future path. The current-epoch equatorial frame is applied to the entire path. Near/far clipping and close-up zoom adapt to the enlarged globe's fixed reference radius; time scrubbing itself does not resize or reframe Earth.
