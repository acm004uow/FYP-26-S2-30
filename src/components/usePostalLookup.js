import { useEffect, useState } from 'react'

// Singapore postal code -> block/street/building/coordinates lookup (OneMap), factored out of
// AddressFields so the booking wizard's Step 2 (postal code only, to sort companies by distance)
// and Step 3 (full AddressFields) share one implementation instead of duplicating the fetch.
export default function usePostalLookup(postalCode) {
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (postalCode.length !== 6) {
      setStatus('')
      setResult(null)
      return
    }

    let cancelled = false
    setStatus('loading')

    fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        const found = data?.results?.[0]
        if (found) {
          const lat = Number(found.LATITUDE)
          const lng = Number(found.LONGITUDE)
          setResult({
            blockNo: found.BLK_NO || '',
            streetName: found.ROAD_NAME || '',
            building: found.BUILDING && found.BUILDING !== 'NIL' ? found.BUILDING : '',
            coordinates: Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null,
          })
          setStatus('found')
        } else {
          setResult(null)
          setStatus('not_found')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult(null)
          setStatus('error')
        }
      })

    return () => { cancelled = true }
  }, [postalCode])

  return { status, result }
}
