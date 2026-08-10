// Customer-facing pricing for one-time bookings ("Money Tap" pricing from the Backend To Improve
// notes): $10/hour, i.e. $5 per 30-minute block. This is informational/record-keeping only — no
// payment is actually processed by this app. The owner's own payment page (payment_link_url on
// their profile) is where the customer actually pays; we just show the amount and let the owner
// mark a booking as paid once they've received it (see BookingsReviewPanel.js).
export const HOURLY_RATE = 10

// Rush/same-day bookings (scheduled within the next hour, bypassing the normal 1-week-advance
// rule) cost more, per the Backend To Improve notes ("if not charges be more").
export const RUSH_SURCHARGE_MULTIPLIER = 1.5

export function calculateBookingPrice(estimatedHours, { urgent = false } = {}) {
  const hours = Number(estimatedHours) || 0
  const base = hours * HOURLY_RATE
  const price = urgent ? base * RUSH_SURCHARGE_MULTIPLIER : base
  return Math.round(price * 100) / 100
}

export function formatBookingPrice(price) {
  return `$${Number(price || 0).toFixed(2)}`
}
