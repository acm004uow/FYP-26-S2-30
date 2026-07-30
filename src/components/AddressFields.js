import { useEffect, useState } from 'react'

// Singapore postal code -> block/street/building lookup (OneMap), shared between the
// customer booking form and the manager's manual "New task" scheduler. Manages its own
// postal code + address state and reports the composed one-line address via onLocationChange.
export default function AddressFields({ onLocationChange, onCoordinatesChange, compact = false }) {
  const [postalCode, setPostalCode] = useState('')
  const [postalLookupStatus, setPostalLookupStatus] = useState('')
  const [address, setAddress] = useState({ blockNo: '', streetName: '', building: '', unitNo: '' })
  const [coordinates, setCoordinates] = useState(null)

  useEffect(() => {
    if (postalCode.length !== 6) {
      setPostalLookupStatus('')
      setCoordinates(null)
      return
    }

    let cancelled = false
    setPostalLookupStatus('loading')

    fetch(`https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        const result = data?.results?.[0]
        if (result) {
          setAddress(prev => ({
            ...prev,
            blockNo: result.BLK_NO || '',
            streetName: result.ROAD_NAME || '',
            building: result.BUILDING && result.BUILDING !== 'NIL' ? result.BUILDING : '',
          }))
          const lat = Number(result.LATITUDE)
          const lng = Number(result.LONGITUDE)
          setCoordinates(Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : null)
          setPostalLookupStatus('found')
        } else {
          setCoordinates(null)
          setPostalLookupStatus('not_found')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCoordinates(null)
          setPostalLookupStatus('error')
        }
      })

    return () => { cancelled = true }
  }, [postalCode])

  useEffect(() => {
    onCoordinatesChange?.(coordinates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinates])

  const composedLocation = [
    [address.blockNo, address.streetName].filter(Boolean).join(' '),
    address.building,
    address.unitNo ? `#${address.unitNo}` : null,
    postalCode.length === 6 ? `Singapore ${postalCode}` : null,
  ].filter(Boolean).join(', ')

  useEffect(() => {
    onLocationChange?.(composedLocation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composedLocation])

  const inputClass = compact
    ? 'w-full px-4 py-2 border rounded-lg text-sm'
    : 'w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-gray-50'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Singapore Postal Code *</label>
          <input
            required
            value={postalCode}
            onChange={e => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            title="Enter a 6-digit Singapore postal code"
            placeholder="e.g. 129588"
            className={inputClass}
          />
          {postalLookupStatus === 'loading' && <p className="mt-1 text-xs text-accent-600">Looking up address...</p>}
          {postalLookupStatus === 'not_found' && <p className="mt-1 text-xs text-red-500">No address found for this postal code. Enter it manually below.</p>}
          {postalLookupStatus === 'error' && <p className="mt-1 text-xs text-red-500">Address lookup failed. Enter it manually below.</p>}
          {postalLookupStatus === '' && <p className="mt-1 text-xs text-accent-600">6-digit postal code, e.g. 129588</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Block No. *</label>
          <input
            required
            value={address.blockNo}
            onChange={e => setAddress({ ...address, blockNo: e.target.value })}
            placeholder="e.g. 693"
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Unit No.</label>
          <input
            value={address.unitNo}
            onChange={e => setAddress({ ...address, unitNo: e.target.value })}
            placeholder="e.g. 12-34"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Street Name *</label>
          <input
            required
            value={address.streetName}
            onChange={e => setAddress({ ...address, streetName: e.target.value })}
            placeholder="e.g. Hougang Street 61"
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Building Name (optional)</label>
        <input
          value={address.building}
          onChange={e => setAddress({ ...address, building: e.target.value })}
          placeholder="e.g. Hougang Spring"
          className={inputClass}
        />
      </div>
      {!compact && <p className="text-xs text-accent-600">Enter the postal code above to auto-fill block, street, and building. Add your unit number manually.</p>}
    </div>
  )
}
