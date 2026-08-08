import { getDistanceMeters, CHECK_IN_RADIUS_METERS } from '../geolocation'

// Job site: 1.3521°N, 103.8198°E (arbitrary Singapore point)
const SITE = { lat: 1.3521, lon: 103.8198 }

test('just inside the radius succeeds', () => {
  // ~0.0027° north ≈ 299m
  const d = getDistanceMeters(SITE.lat, SITE.lon, SITE.lat + 0.00269, SITE.lon)
  expect(d).toBeLessThan(CHECK_IN_RADIUS_METERS)
})

test('just outside the radius fails', () => {
  const d = getDistanceMeters(SITE.lat, SITE.lon, SITE.lat + 0.00272, SITE.lon)
  expect(d).toBeGreaterThan(CHECK_IN_RADIUS_METERS)
})
