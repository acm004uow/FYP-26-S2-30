import { useEffect, useRef } from 'react'
import L from 'leaflet'

const SINGAPORE_CENTER = [1.3521, 103.8198]

// Inline SVG divIcon instead of the default Leaflet marker images — Next.js's
// webpack build doesn't resolve leaflet's bundled image asset URLs, which
// leaves the default icon broken (missing-image squares) without this.
const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="32" height="32" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35))">
    <path d="M12 0C7.6 0 4 3.6 4 8c0 5.9 7.1 15.3 7.4 15.7a0.75 0.75 0 0 0 1.2 0C12.9 23.3 20 13.9 20 8c0-4.4-3.6-8-8-8z" fill="#2563eb"/>
    <circle cx="12" cy="8" r="3.2" fill="white"/>
  </svg>`,
  iconSize: [32, 32],
  iconAnchor: [16, 30],
  popupAnchor: [0, -28],
})

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]))
}

const TILE_LAYERS = {
  map: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
  },
}

// Built with plain Leaflet rather than react-leaflet: react-leaflet's
// <MapContainer> measures its container on mount, and inside a CSS grid cell
// that can happen before the grid has settled on a final size, leaving the
// map permanently stuck at 0x0 (blank white box, no tiles). Owning the
// L.map() instance directly lets us force a re-measure (invalidateSize)
// once the layout has painted.
export default function OnSiteMap({ points, satellite = false }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const tileLayerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: SINGAPORE_CENTER,
      zoom: 12,
      scrollWheelZoom: true,
    })
    mapRef.current = map

    const raf = requestAnimationFrame(() => map.invalidateSize())

    return () => {
      cancelAnimationFrame(raf)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Swaps the tile layer instead of recreating the map so toggling map/satellite
  // doesn't reset the current pan/zoom position.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const layer = satellite ? TILE_LAYERS.satellite : TILE_LAYERS.map
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(layer.url, { attribution: layer.attribution, maxZoom: 19 }).addTo(map)
  }, [satellite])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    const validPoints = points.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))

    validPoints.forEach(point => {
      const marker = L.marker([point.latitude, point.longitude], { icon: pinIcon })
        .addTo(map)
        .bindPopup(
          `<p style="font-weight:600;font-size:13px;margin:0">${escapeHtml(point.name)}</p>` +
          `<p style="font-size:12px;color:#6b7280;margin:2px 0 0">${escapeHtml(point.location || '')}</p>`
        )
      markersRef.current.push(marker)
    })

    if (validPoints.length === 1) {
      map.setView([validPoints[0].latitude, validPoints[0].longitude], 15)
    } else if (validPoints.length > 1) {
      const bounds = L.latLngBounds(validPoints.map(p => [p.latitude, p.longitude]))
      map.fitBounds(bounds, { padding: [48, 48] })
    }
  }, [points])

  return <div ref={containerRef} className="absolute inset-0" />
}
