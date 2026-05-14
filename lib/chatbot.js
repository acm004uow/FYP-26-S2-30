export function chatbotReply(message, role) {
  const text = String(message || "").toLowerCase();

  if (text.includes("daily") && text.includes("report")) return "Manager report: Open Reports and choose Daily to view today or a selected date.";
  if (text.includes("weekly") && text.includes("report")) return "Manager report: Open Reports and choose Weekly to view workload and task summaries for the week.";
  if (text.includes("monthly") && text.includes("report")) return "Manager report: Open Reports and choose Monthly to view monthly performance summaries.";
  if (text.includes("allocation") || text.includes("status")) return "Allocation status can be checked from Task Requests. Pending means waiting for manager review. Approved means staff has been assigned.";
  if (text.includes("availability")) return "Staff can update availability from the Availability page. Managers can view real-time availability from the Availability page.";
  if (text.includes("assigned") || text.includes("my task")) return "Staff members can view assigned tasks from My Tasks and update them to In Progress or Completed.";
  if (text.includes("proof") || text.includes("upload")) return "Open the assigned task and use Upload Proof to attach a photo or document after completion.";
  if (text.includes("urgent")) return "Department Staff can create an urgent task by selecting Urgent priority in Create Task Request.";
  if (text.includes("recommend")) return "The system recommends staff based on availability, skills, region, workload, working-hour eligibility, and performance rating.";
  if (role === "department_staff") return "You can create, update, cancel, search, and track task requests from the Department dashboard.";
  if (role === "staff_member") return "You can update availability, view assigned tasks, upload proof, and check performance feedback.";
  if (role === "manager") return "You can manage staff/user accounts, review task requests, view availability, reports, notifications, and use recommendations.";
  if (role === "system_admin") return "You can manage user roles, reset passwords, configure parameters, and monitor security/audit logs.";
  return "Please ask about tasks, availability, reports, recommendations, proof upload, or allocation status.";
}
