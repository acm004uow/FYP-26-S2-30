const defaultRecommendationParams = {
  workload_threshold: 3,
  max_weekly_hours_default: 40,
  availability_weight: 30,
  skill_weight: 25,
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
    skill: getWeight(params, 'skill', defaultRecommendationParams.skill_weight),
    region: getWeight(params, 'region', defaultRecommendationParams.region_weight),
    hours: getWeight(params, 'hours', defaultRecommendationParams.hours_weight),
    workload: getWeight(params, 'workload', defaultRecommendationParams.workload_weight),
    performance: getWeight(params, 'performance', defaultRecommendationParams.performance_weight),
  };

  const workloadThreshold = getThreshold(params, 'workload_threshold', defaultRecommendationParams.workload_threshold)
  const maxWeeklyHours = getThreshold(params, 'max_weekly_hours_default', defaultRecommendationParams.max_weekly_hours_default)

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

  const skills = Array.isArray(staff.skills) ? staff.skills.map((s) => normalizeText(s)) : []
  if (task.required_skill && skills.includes(normalizeText(task.required_skill))) {
    score += weights.skill
    reasons.push('Skill matched')
    scoreBreakdown.push({ factor: 'Skill', matched: true, weight: weights.skill, description: `Matches required skill: ${task.required_skill}` })
  } else {
    scoreBreakdown.push({ factor: 'Skill', matched: false, weight: weights.skill, description: `Missing required skill: ${task.required_skill || 'unspecified'}` })
  }

  if (task.location && normalizeText(staff.assigned_region) === normalizeText(task.location)) {
    score += weights.region
    reasons.push('Region/location matched')
    scoreBreakdown.push({ factor: 'Region', matched: true, weight: weights.region, description: `Assigned region matches task location` })
  } else {
    scoreBreakdown.push({ factor: 'Region', matched: false, weight: weights.region, description: `Assigned region does not match task location` })
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

export function formatRecommendationExplanation(recommendation) {
  if (!recommendation?.explanation?.length) {
    return recommendation?.reason || 'No match details available'
  }

  return recommendation.explanation
    .filter((item) => item.matched)
    .map((item) => `${item.factor}: ${item.description}`)
    .join(' • ') || recommendation.reason
}

export function generateRecommendations(staffList, task, params = {}) {
  return (staffList || [])
    .filter((staff) => !staff.is_suspended && staff.status !== 'suspended')
    .map((staff) => calculateStaffScore(staff, task, params))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
}
