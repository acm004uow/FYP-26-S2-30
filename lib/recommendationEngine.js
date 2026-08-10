import { getDistanceMeters } from './geolocation'
import { getConflictingStaffIds } from './staffAvailability'

const defaultRecommendationParams = {
  workload_threshold: 3,
  max_weekly_hours_default: 40,
  proximity_radius: 10,
  availability_weight: 30,
  region_weight: 20,
  hours_weight: 15,
  workload_weight: 10,
  performance_weight: 10,
};

function normalizeParam(params, snakeKey, camelKey, fallback) {
  if (params == null) return fallback
  if (Object.prototype.hasOwnProperty.call(params, snakeKey)) return params[snakeKey]
  if (Object.prototype.hasOwnProperty.call(params, camelKey)) return params[camelKey]
  return fallback
}

function getWeight(params, key, fallback) {
  return Number(normalizeParam(params, `${key}_weight`, `${key}Weight`, fallback))
}

function getThreshold(params, key, fallback) {
  return Number(normalizeParam(params, key, key, fallback))
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

export function calculateStaffScore(staff, task, params = {}) {
  const weights = {
    availability: getWeight(params, 'availability', defaultRecommendationParams.availability_weight),
    region: getWeight(params, 'region', defaultRecommendationParams.region_weight),
    hours: getWeight(params, 'hours', defaultRecommendationParams.hours_weight),
    workload: getWeight(params, 'workload', defaultRecommendationParams.workload_weight),
    performance: getWeight(params, 'performance', defaultRecommendationParams.performance_weight),
  };

  const workloadThreshold = getThreshold(params, 'workload_threshold', defaultRecommendationParams.workload_threshold)
  const maxWeeklyHours = getThreshold(params, 'max_weekly_hours_default', defaultRecommendationParams.max_weekly_hours_default)
  const proximityRadiusKm = getThreshold(params, 'proximity_radius', defaultRecommendationParams.proximity_radius)

  let score = 0
  const reasons = []
  const scoreBreakdown = []

  if (normalizeText(staff.availability) === 'available') {
    score += weights.availability
    reasons.push('Available')
    scoreBreakdown.push({ factor: 'Availability', matched: true, weight: weights.availability, description: 'Staff is available now' })
  } else {
    scoreBreakdown.push({ factor: 'Availability', matched: false, weight: weights.availability, description: 'Staff is not currently available' })
  }

  const hasStaffCoords = Number.isFinite(staff.latitude) && Number.isFinite(staff.longitude)
  const hasTaskCoords = Number.isFinite(task.latitude) && Number.isFinite(task.longitude)
  if (hasStaffCoords && hasTaskCoords) {
    const distanceKm = getDistanceMeters(staff.latitude, staff.longitude, task.latitude, task.longitude) / 1000
    if (distanceKm <= proximityRadiusKm) {
      score += weights.region
      reasons.push('Nearby')
      scoreBreakdown.push({ factor: 'Proximity', matched: true, weight: weights.region, description: `${distanceKm.toFixed(1)}km from the job, within the ${proximityRadiusKm}km radius` })
    } else {
      scoreBreakdown.push({ factor: 'Proximity', matched: false, weight: weights.region, description: `${distanceKm.toFixed(1)}km from the job — outside the ${proximityRadiusKm}km radius` })
    }
  } else {
    scoreBreakdown.push({ factor: 'Proximity', matched: false, weight: weights.region, description: 'Staff home address or job location is missing, so distance could not be checked' })
  }

  const totalHours = Number(staff.weekly_working_hours || 0) + Number(task.estimated_hours || 0)
  if (totalHours <= maxWeeklyHours) {
    score += weights.hours
    reasons.push('Within working-hour limit')
    scoreBreakdown.push({ factor: 'Working hours', matched: true, weight: weights.hours, description: `Within weekly hours (${totalHours}/${maxWeeklyHours})` })
  } else {
    scoreBreakdown.push({ factor: 'Working hours', matched: false, weight: weights.hours, description: `Exceeds weekly hours limit (${totalHours}/${maxWeeklyHours})` })
  }

  if (Number(staff.current_workload || 0) <= workloadThreshold) {
    score += weights.workload
    reasons.push('Low workload')
    scoreBreakdown.push({ factor: 'Workload', matched: true, weight: weights.workload, description: `Current workload is at or below threshold (${staff.current_workload}/${workloadThreshold})` })
  } else {
    scoreBreakdown.push({ factor: 'Workload', matched: false, weight: weights.workload, description: `Current workload exceeds threshold (${staff.current_workload}/${workloadThreshold})` })
  }

  if (Number(staff.performance_rating || 0) >= 4) {
    score += weights.performance
    reasons.push('Good performance rating')
    scoreBreakdown.push({ factor: 'Performance', matched: true, weight: weights.performance, description: `Performance rating is strong (${staff.performance_rating})` })
  } else {
    scoreBreakdown.push({ factor: 'Performance', matched: false, weight: weights.performance, description: `Performance rating is below preferred level (${staff.performance_rating})` })
  }

  return {
    staff_id: staff.id,
    staff_name: staff.staff_name,
    score,
    reason: reasons.length ? reasons.join(', ') : 'No strong match',
    explanation: scoreBreakdown,
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Looks for a staff member's name mentioned in a customer's free-text notes/description
// (e.g. "May I schedule with Alice Tan if available" or "May I book to Saung"), so an
// explicit customer request can be honored ahead of the algorithmic score.
export function findRequestedStaffByName(text, staffList) {
  const source = String(text || '')
  if (!source.trim() || !Array.isArray(staffList) || !staffList.length) return null

  const candidates = staffList
    .filter((staff) => staff.staff_name && String(staff.staff_name).trim())
    .map((staff) => ({ staff, name: String(staff.staff_name).trim() }))
    .sort((a, b) => b.name.length - a.name.length)

  for (const { staff, name } of candidates) {
    if (new RegExp(`\\b${escapeRegex(name)}\\b`, 'i').test(source)) return staff
  }

  // Fall back to matching a single name part (e.g. "Saung" out of "Saung Hnin Phyu")
  for (const { staff, name } of candidates) {
    const parts = name.split(/\s+/).filter((part) => part.length > 1)
    if (parts.some((part) => new RegExp(`\\b${escapeRegex(part)}\\b`, 'i').test(source))) return staff
  }

  return null
}

export function formatRecommendationExplanation(recommendation) {
  if (!recommendation?.explanation?.length) {
    return recommendation?.reason || 'No match details available'
  }

  return recommendation.explanation
    .filter((item) => item.matched)
    .map((item) => `${item.factor}: ${item.description}`)
    .join(' • ') || recommendation.reason
}

// existingBookings is every OTHER already-assigned booking for this company (see
// lib/staffAvailability.js#fetchAssignedBookingsForDate) — anyone whose job overlaps this task's
// date/time is excluded outright, same as being on approved time off, so the top score can never
// be a staff member who's already committed to a different job at that hour.
export function generateRecommendations(staffList, task, params = {}, excludedStaffIds = new Set(), existingBookings = []) {
  const conflictingStaffIds = getConflictingStaffIds(task, existingBookings, { excludeBookingId: task.exclude_booking_id })
  const allExcludedIds = new Set([...excludedStaffIds, ...conflictingStaffIds])
  const pool = (staffList || []).filter((staff) => !staff.is_suspended && staff.status !== 'suspended' && !allExcludedIds.has(staff.id))
  const scored = pool.map((staff) => calculateStaffScore(staff, task, params))

  const requestedStaff = findRequestedStaffByName(task.requested_text, pool)
  let boosted = false
  if (requestedStaff) {
    const requestedMatch = scored.find((item) => item.staff_id === requestedStaff.id)
    if (requestedMatch) {
      requestedMatch.score += 1000
      const otherReasons = requestedMatch.reason === 'No strong match' ? [] : requestedMatch.reason.split(', ')
      requestedMatch.reason = ['Customer requested by name', ...otherReasons].join(', ')
      requestedMatch.explanation = [
        { factor: 'Customer request', matched: true, weight: 0, description: 'Customer asked for this staff member by name' },
        ...requestedMatch.explanation,
      ]
      boosted = true
    }
  }

  // Recurring-booking continuity: prefer whoever did the last visit for this same recurring
  // booking, but only if they're still otherwise eligible (score > 0) — this shouldn't force an
  // unqualified or unavailable staff member onto the job, just break ties toward familiarity.
  if (!boosted && task.preferred_staff_id) {
    const preferredMatch = scored.find((item) => item.staff_id === task.preferred_staff_id)
    if (preferredMatch && preferredMatch.score > 0) {
      preferredMatch.score += 1000
      const otherReasons = preferredMatch.reason === 'No strong match' ? [] : preferredMatch.reason.split(', ')
      preferredMatch.reason = ['Continuity: previously assigned for this recurring booking', ...otherReasons].join(', ')
      preferredMatch.explanation = [
        { factor: 'Continuity', matched: true, weight: 0, description: 'Previously assigned for this recurring booking' },
        ...preferredMatch.explanation,
      ]
    }
  }

  return scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score)
}
