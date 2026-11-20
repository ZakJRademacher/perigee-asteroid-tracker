// Plain-language helpers for the "At a glance" tab. Every phrase is derived from
// the same numbers shown in "Deep dive"; comparisons are rounded on purpose.
export const LD_KM = 384400;
export const LIGHT_KM_S = 299792.458;
const EARTH_RADIUS_KM = 6371;

// Familiar objects, by longest dimension in metres. The nearest one on a
// logarithmic scale is used, so "about the size of" stays honest at any size.
const SIZE_REFERENCES = [
  [2, 'a refrigerator'],
  [4.5, 'a car'],
  [12, 'a school bus'],
  [30, 'a blue whale'],
  [70, 'a jumbo jet'],
  [110, 'a football field'],
  [330, 'the Eiffel Tower'],
  [443, 'the Empire State Building'],
  [830, 'the world’s tallest building'],
  [2700, 'the Golden Gate Bridge'],
  [6000, 'a small town'],
  [20000, 'a city']
];
export function sizeComparison(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return null;
  const meters = (min + max) / 2;
  let best = SIZE_REFERENCES[0];
  for (const ref of SIZE_REFERENCES)
    if (Math.abs(Math.log(meters / ref[0])) < Math.abs(Math.log(meters / best[0]))) best = ref;
  return { meters, thing: best[1], text: 'roughly the size of ' + best[1] };
}
export function distanceStory(km) {
  const ld = km / LD_KM;
  if (ld < 1)
    return {
      ld,
      short: 'closer than the Moon',
      text: 'closer than the Moon, about ' + Math.round(ld * 100) + '% of the way there'
    };
  const times = ld < 10 ? ld.toFixed(1) : Math.round(ld).toLocaleString('en-US');
  return { ld, short: times + '× the Moon’s distance', text: times + ' times farther away than the Moon' };
}
// New York to London is about 5,570 km.
export function speedStory(kmPerSecond) {
  const kmh = kmPerSecond * 3600,
    seconds = 5570 / kmPerSecond;
  const trip = seconds < 90 ? Math.round(seconds) + ' seconds' : Math.round(seconds / 60) + ' minutes';
  return { kmh, text: 'fast enough to fly from New York to London in ' + trip };
}
export function lightTime(km) {
  const s = km / LIGHT_KM_S;
  return s < 1
    ? (s * 1000).toFixed(0) + ' milliseconds'
    : s < 120
      ? s.toFixed(s < 10 ? 1 : 0) + ' seconds'
      : (s / 60).toFixed(1) + ' minutes';
}
// Airliners cruise near 10.7 km.
export function heightStory(altitudeKm) {
  const jets = altitudeKm / 10.7;
  return {
    text:
      jets < 1000
        ? Math.round(jets).toLocaleString('en-US') + ' times higher than a passenger jet flies'
        : Math.round((altitudeKm / EARTH_RADIUS_KM) * 10) / 10 + ' Earth radii above the surface'
  };
}
export function launchYear(intl) {
  const m = /^(\d{4})-\d{3}/.exec(String(intl ?? ''));
  return m ? Number(m[1]) : null;
}
export function orbitClass({ periodMinutes, eccentricity, semiMajorKm }) {
  const perigee = semiMajorKm * (1 - eccentricity) - 6378.137,
    apogee = semiMajorKm * (1 + eccentricity) - 6378.137;
  if (Math.abs(periodMinutes - 1436.1) < 30 && eccentricity < 0.05)
    return {
      code: 'GEO',
      label: 'Geosynchronous orbit',
      text: 'It goes around once a day, keeping pace with Earth’s spin, so from the ground it seems to hang in one place.'
    };
  if (eccentricity >= 0.25)
    return {
      code: 'HEO',
      label: 'Highly elliptical orbit',
      text:
        'Its orbit is a long oval: it swoops down to ' +
        Math.round(perigee).toLocaleString('en-US') +
        ' km, then climbs out to ' +
        Math.round(apogee).toLocaleString('en-US') +
        ' km.'
    };
  if (apogee < 2000)
    return {
      code: 'LEO',
      label: 'Low Earth orbit',
      text: 'It flies in low Earth orbit, the busy neighborhood just above the atmosphere.'
    };
  return {
    code: 'MEO',
    label: 'Medium Earth orbit',
    text: 'It flies in medium Earth orbit, between low orbit and the geostationary belt, where navigation satellites live.'
  };
}
export function orbitStory(periodMinutes) {
  const laps = 1440 / periodMinutes;
  if (Math.abs(periodMinutes - 1436.1) < 30) return 'One trip around Earth takes about a day.';
  const time =
    periodMinutes < 120 ? Math.round(periodMinutes) + ' minutes' : (periodMinutes / 60).toFixed(1) + ' hours';
  return (
    'It circles Earth every ' +
    time +
    ', about ' +
    (laps >= 2 ? Math.round(laps * 10) / 10 : laps.toFixed(2)) +
    ' laps a day.'
  );
}
// Cylindrical Earth shadow: behind Earth relative to the Sun, within one Earth radius of the axis.
export function inEarthShadow(position, sunPosition) {
  const sun = Math.hypot(...sunPosition),
    u = sunPosition.map(v => v / sun),
    along = position.reduce((s, v, k) => s + v * u[k], 0);
  if (along >= 0) return false;
  return Math.hypot(...position.map((v, k) => v - along * u[k])) < EARTH_RADIUS_KM;
}
const ROLES = {
  stations: 'Part of the crewed outposts in orbit, or a vehicle visiting them.',
  gnss: 'Part of a satellite navigation system. Phones and car maps work out where they are from signals like this one’s.',
  weather: 'Watches clouds, storms and temperatures to feed weather forecasts.',
  science: 'A science mission: studying space, the Sun or Earth from orbit.',
  geo: 'Rides the geostationary belt above the equator, mostly relaying TV, internet and communications.',
  starlink: 'One of thousands of SpaceX Starlink satellites beaming internet service to the ground.',
  oneweb: 'One of the OneWeb satellites providing internet links from low orbit.'
};
const SPECIAL = [
  [
    /^ISS \(/,
    'The International Space Station, a laboratory the size of a football field where astronauts have lived continuously since 2000.'
  ],
  [/^CSS \(/, 'A module of China’s Tiangong space station, crewed by taikonauts.'],
  [/^SOYUZ/, 'A Russian Soyuz capsule that carries astronauts to and from the space station.'],
  [/^PROGRESS/, 'A Russian Progress cargo ship that delivers food, fuel and supplies to the space station.'],
  [/DRAGON/, 'A SpaceX Dragon capsule carrying crew or cargo to the space station.'],
  [/^(SHENZHOU|SZ-)/, 'A Chinese Shenzhou spacecraft that carries crews to Tiangong.'],
  [/^TIANZHOU/, 'A Chinese Tianzhou cargo ship supplying the Tiangong station.'],
  [/^HST$/, 'The Hubble Space Telescope, photographing galaxies, nebulae and planets since 1990.'],
  [/^CXO$/, 'The Chandra X-ray Observatory, which sees the X-ray glow of black holes and exploded stars.'],
  [/^SDO$/, 'The Solar Dynamics Observatory, watching the Sun around the clock.'],
  [/^NUSTAR$/, 'NuSTAR, a telescope that focuses high-energy X-rays to study black holes.'],
  [/GLAST/, 'The Fermi Gamma-ray Space Telescope, mapping the most energetic light in the universe.'],
  [
    /^MMS \d/,
    'One of four Magnetospheric Multiscale spacecraft flying in formation to study Earth’s magnetic field.'
  ],
  [
    /^GOES|GOES \d/,
    'A NOAA GOES weather satellite, the source of many of the cloud loops in weather reports.'
  ],
  [
    /^TDRS/,
    'A NASA Tracking and Data Relay Satellite, passing data between other spacecraft, including the ISS, and the ground.'
  ],
  [/^GPS /, 'Part of the U.S. Global Positioning System.'],
  [/GALILEO|^GSAT0/, 'Part of Europe’s Galileo navigation system.'],
  [/^BEIDOU/, 'Part of China’s BeiDou navigation system.'],
  [/^CYGFM/, 'One of eight CYGNSS microsatellites measuring winds inside hurricanes.']
];
export function satelliteRole(name, group) {
  for (const [pattern, text] of SPECIAL) if (pattern.test(name)) return text;
  return ROLES[group] ?? 'An active satellite.';
}
