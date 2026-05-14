export function calculateStaffScore(staff, task, params = {}) {
  const weights = {
    availability: Number(params.availability_weight ?? 30),
    skill: Number(params.skill_weight ?? 25),
    region: Number(params.region_weight ?? 20),
    hours: Number(params.hours_weight ?? 15),
    workload: Number(params.workload_weight ?? 10),
    performance: Number(params.performance_weight ?? 10)
  };
  const workloadThreshold = Number(params.workload_threshold ?? 3);
  let score = 0;
  const reasons = [];

  if (staff.availability === "available") {
    score += weights.availability;
    reasons.push("Available");
  }
  const skills = Array.isArray(staff.skills) ? staff.skills.map((s) => String(s).toLowerCase()) : [];
  if (skills.includes(String(task.required_skill || "").toLowerCase())) {
    score += weights.skill;
    reasons.push("Skill matched");
  }
  if (String(staff.assigned_region || "").toLowerCase() === String(task.location || "").toLowerCase()) {
    score += weights.region;
    reasons.push("Region/location matched");
  }
  const totalHours = Number(staff.weekly_working_hours || 0) + Number(task.estimated_hours || 0);
  if (totalHours <= Number(staff.max_weekly_hours || 40)) {
    score += weights.hours;
    reasons.push("Within working-hour limit");
  }
  if (Number(staff.current_workload || 0) <= workloadThreshold) {
    score += weights.workload;
    reasons.push("Low workload");
  }
  if (Number(staff.performance_rating || 0) >= 4) {
    score += weights.performance;
    reasons.push("Good performance rating");
  }

  return {
    staff_id: staff.id,
    staff_name: staff.staff_name,
    score,
    reason: reasons.length ? reasons.join(", ") : "No strong match"
  };
}

export function generateRecommendations(staffList, task, params = {}) {
  return (staffList || [])
    .filter((staff) => !staff.is_suspended && staff.status !== "suspended")
    .map((staff) => calculateStaffScore(staff, task, params))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}
