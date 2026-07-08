// Staff must be within this many meters of the booking's address to check in.
// Generous enough to absorb typical phone GPS drift (often 10-50m) and large compounds/buildings.
export const CHECK_IN_RADIUS_METERS = 300

export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Wraps the browser Geolocation API in a promise. Rejects with a short, user-facing
// message (permission denied, unsupported browser, timeout, etc.) rather than the raw error.
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are not available on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('Location access was denied. Enable location services to check in.'))
        } else {
          reject(new Error('Could not determine your location. Try again.'))
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}
