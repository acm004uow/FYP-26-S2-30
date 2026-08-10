// Thin wrapper around the Places API (New) — server-side only, never call this from client code
// since it needs GOOGLE_PLACES_API_KEY. Two operations: search by free text (so a company owner
// can find and link their own real Google Business Profile listing from Marketing Page) and fetch
// the current rating for an already-linked place (used by the on-demand refresh button and the
// daily cron job). Every booking-page read of a rating goes through the cached profiles.google_*
// columns instead — we never call Google live on a customer page load.

const PLACES_BASE = 'https://places.googleapis.com/v1/places'

function getApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) throw new Error('Google ratings are not configured (missing GOOGLE_PLACES_API_KEY).')
  return key
}

// Returns up to 5 candidate listings for a free-text query (e.g. a business name + city), so the
// owner can pick the one that's actually theirs rather than us guessing.
export async function searchGooglePlaces(textQuery) {
  const apiKey = getApiKey()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  let response
  try {
    response = await fetch(`${PLACES_BASE}:searchText`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
      },
      body: JSON.stringify({ textQuery, maxResultCount: 5 }),
    })
  } finally {
    clearTimeout(timeoutId)
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error?.message || `Google Places search failed (${response.status}).`)
  }

  return (data?.places || []).map((place) => ({
    placeId: place.id,
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    rating: typeof place.rating === 'number' ? place.rating : null,
    userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : 0,
  }))
}

// Fetches the current rating for an already-linked place ID.
export async function fetchGooglePlaceRating(placeId) {
  const apiKey = getApiKey()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)
  let response
  try {
    response = await fetch(`${PLACES_BASE}/${encodeURIComponent(placeId)}`, {
      signal: controller.signal,
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount',
      },
    })
  } finally {
    clearTimeout(timeoutId)
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error?.message || `Google Places lookup failed (${response.status}).`)
  }

  return {
    placeId: data?.id || placeId,
    name: data?.displayName?.text || '',
    rating: typeof data?.rating === 'number' ? data.rating : null,
    userRatingCount: typeof data?.userRatingCount === 'number' ? data.userRatingCount : 0,
  }
}
