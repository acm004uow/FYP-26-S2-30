import {
  calculateStaffScore,
  findRequestedStaffByName,
  generateRecommendations,
} from '../recommendationEngine'

const SITE = { latitude: 1.3521, longitude: 103.8198 }

test('a staff member meeting every default criterion scores the full 85 points', () => {
  const staff = {
    id: 's1', staff_name: 'Alice Tan', availability: 'available',
    latitude: SITE.latitude, longitude: SITE.longitude, // same spot as the job -> within radius
    weekly_working_hours: 10, current_workload: 1, performance_rating: 5,
  }
  const task = { estimated_hours: 2, latitude: SITE.latitude, longitude: SITE.longitude }
  const result = calculateStaffScore(staff, task, {})
  expect(result.score).toBe(85) // 30 + 20 + 15 + 10 + 10
})

test('a staff member meeting no criteria scores 0, not negative', () => {
  const staff = {
    id: 's2', staff_name: 'Bob Lee', availability: 'unavailable',
    latitude: 10, longitude: 10, // far from the job
    weekly_working_hours: 45, current_workload: 10, performance_rating: 1,
  }
  const task = { estimated_hours: 2, ...SITE }
  const result = calculateStaffScore(staff, task, {})
  expect(result.score).toBe(0)
})

test('findRequestedStaffByName matches a full name mentioned in free text', () => {
  const staff = [{ id: 'a1', staff_name: 'Alice Tan' }, { id: 'b1', staff_name: 'Bob Lee' }]
  expect(findRequestedStaffByName('Please send Alice Tan again', staff)).toBe(staff[0])
})

test('findRequestedStaffByName falls back to matching a single name part', () => {
  const staff = [{ id: 'a1', staff_name: 'Alice Tan' }, { id: 'b1', staff_name: 'Bob Lee' }]
  expect(findRequestedStaffByName("please send Alice if she's free", staff)).toBe(staff[0])
})

test('findRequestedStaffByName returns null when nobody is mentioned', () => {
  const staff = [{ id: 'a1', staff_name: 'Alice Tan' }]
  expect(findRequestedStaffByName('need someone for tomorrow', staff)).toBeNull()
})

test('generateRecommendations boosts a customer-named staff member ahead of a higher base score', () => {
  const alice = { id: 'a1', staff_name: 'Alice Tan', availability: 'available', weekly_working_hours: 35, current_workload: 1, performance_rating: 5 }
  const bob = { id: 'b1', staff_name: 'Bob Lee', availability: 'available', weekly_working_hours: 5, current_workload: 1, performance_rating: 5 }
  const task = { estimated_hours: 10, requested_text: 'please assign Alice Tan' }

  const results = generateRecommendations([alice, bob], task)

  expect(results[0].staff_id).toBe('a1')
  expect(results[0].score).toBe(1050) // 50 base + 1000 boost
  expect(results[0].reason).toContain('Customer requested by name')
  expect(results[1].staff_id).toBe('b1')
  expect(results[1].score).toBe(65)
})

test('generateRecommendations applies the continuity boost only when the preferred staff is still eligible', () => {
  const eligible = { id: 'a1', staff_name: 'Alice Tan', availability: 'available', weekly_working_hours: 10, current_workload: 1, performance_rating: 5 }
  const ineligible = { id: 'z1', staff_name: 'Zoe Ng', availability: 'unavailable', weekly_working_hours: 45, current_workload: 10, performance_rating: 1 }

  const boosted = generateRecommendations([eligible], { estimated_hours: 2, preferred_staff_id: 'a1' })
  expect(boosted[0].score).toBe(1065) // 65 base + 1000 boost
  expect(boosted[0].reason).toContain('Continuity: previously assigned for this recurring booking')

  // an unqualified preferred staff member (score 0) is not forced onto the job
  const notBoosted = generateRecommendations([ineligible], { estimated_hours: 2, preferred_staff_id: 'z1' })
  expect(notBoosted).toHaveLength(0)
})

test('generateRecommendations excludes suspended and explicitly-excluded staff entirely', () => {
  const alice = { id: 'a1', staff_name: 'Alice Tan', availability: 'available', weekly_working_hours: 10, current_workload: 1, performance_rating: 5 }
  const suspended = { id: 's1', staff_name: 'Sam Poh', availability: 'available', weekly_working_hours: 10, current_workload: 1, performance_rating: 5, is_suspended: true }
  const bob = { id: 'b1', staff_name: 'Bob Lee', availability: 'available', weekly_working_hours: 10, current_workload: 1, performance_rating: 5 }

  const results = generateRecommendations([alice, suspended, bob], { estimated_hours: 2 }, {}, new Set(['b1']))
  const ids = results.map((r) => r.staff_id)
  expect(ids).toEqual(['a1']) // suspended filtered by role, bob filtered by exclusion set
})
