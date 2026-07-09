import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

export default function AttendanceScanner({ onClose, onResult }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const scannedRef = useRef(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('starting')

  const stopCamera = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop())
  }

  useEffect(() => {
    let cancelled = false

    const tick = () => {
      if (cancelled || scannedRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code?.data) {
          scannedRef.current = true
          handleDecoded(code.data)
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const handleDecoded = async (decodedText) => {
      setStatus('processing')
      stopCamera()
      let token = decodedText
      try {
        token = new URL(decodedText).searchParams.get('token') || decodedText
      } catch {
        // Not a URL — treat the decoded text as a raw token.
      }

      const { data: { session } } = await supabase.auth.getSession()
      try {
        const response = await fetch('/api/attendance/check-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ token }),
        })
        const result = await response.json()
        if (!response.ok) {
          onResult({ status: 'error', message: result.error || 'Check-in failed.' })
          return
        }
        onResult({ status: result.status, record: result.record })
      } catch {
        onResult({ status: 'error', message: 'Could not reach the server. Try again.' })
      }
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setStatus('scanning')
        tick()
      } catch {
        setError('Camera access was denied or is unavailable. Enable camera permissions and try again.')
      }
    }

    start()

    return () => {
      cancelled = true
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Scan Office QR Code</h3>
          <button
            type="button"
            onClick={() => { stopCamera(); onClose() }}
            aria-label="Close scanner"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-600">{error}</div>
        ) : (
          <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            {status === 'processing' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">Checking in...</div>
            )}
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <p className="mt-3 text-center text-xs text-gray-400">Point your camera at the office QR code.</p>
      </div>
    </div>
  )
}
