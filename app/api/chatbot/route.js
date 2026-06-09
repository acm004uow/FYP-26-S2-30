import { NextResponse } from "next/server";

const roleNames = {
  manager: "Manager",
  department: "Department Staff",
  staffMember: "Staff Member",
  admin: "System Admin",
};

const roleContext = {
  manager: "Managers review task requests, assign staff, view staff profiles, manage user accounts, and generate operational reports.",
  department: "Department staff create task requests, mark urgent work, track request status, cancel pending requests, and view completion history.",
  staffMember: "Staff members view assigned tasks, update availability, start work, complete tasks, upload proof, and check feedback.",
  admin: "System admins manage accounts, reset passwords, monitor security logs, review audit logs, and tune global allocation parameters.",
};

const normalizeRole = (role) => ({
  system_admin: "admin",
  staff_member: "staffMember",
  department_staff: "department",
}[role] || role || "manager");

const cleanHistory = (messages = []) => messages
  .filter(message => ["user", "bot"].includes(message.role) && message.content)
  .slice(-8)
  .map(message => ({
    role: message.role === "bot" ? "model" : "user",
    parts: [{ text: String(message.content).slice(0, 1000) }],
  }));

const getLocalReply = (message, role) => {
  const normalizedMessage = message.toLowerCase();

  if (role === "manager") {
    if (normalizedMessage.includes("daily") && normalizedMessage.includes("report")) {
      return "Open Reports, choose Daily, and generate the report to see today's task volume, completion rate, urgent requests, utilization, and top assigned staff.";
    }

    if (normalizedMessage.includes("weekly") && normalizedMessage.includes("report")) {
      return "Open Reports, choose Weekly, and generate the report to review the last 7 days of tasks, pending work, utilization, ratings, and task categories.";
    }

    if (normalizedMessage.includes("monthly") && normalizedMessage.includes("report")) {
      return "Open Reports, choose Monthly, and generate the report to review the last 30 days of operations and performance trends.";
    }

    if (normalizedMessage.includes("quick report") || normalizedMessage.includes("report")) {
      return "Use Reports for daily, weekly, or monthly operational summaries. For a faster check, ask me for a daily report, weekly report, or monthly report.";
    }

    if (normalizedMessage.includes("allocation") || normalizedMessage.includes("status")) {
      return "Check allocation status in Task Requests and the Manager Dashboard. Pending requests need review, approved tasks are ready or assigned, in-progress tasks are underway, and completed tasks are closed.";
    }

    if (normalizedMessage.includes("availability")) {
      return "Open Availability to monitor real-time staff availability, workload, skills, regions, suspended staff, and scheduling changes.";
    }
  }

  if (role === "admin") {
    if (normalizedMessage.includes("reset") && normalizedMessage.includes("password")) {
      return "Open Admin Panel, find the user in User Accounts, choose Reset, enter a new temporary password, and confirm. The reset is recorded in Security Logs and Audit Logs.";
    }

    if (normalizedMessage.includes("security") && normalizedMessage.includes("log")) {
      return "Open Admin Panel and check Security Logs. It shows recent security events such as password resets and account-related activity, with the latest entries first.";
    }

    if (normalizedMessage.includes("audit") && normalizedMessage.includes("log")) {
      return "Open Admin Panel and check Audit Logs. Use it to review admin actions such as password resets, role changes, and global parameter updates.";
    }
  }

  return "";
};

export async function POST(request) {
  try {
    const { message, role, history } = await request.json();
    const userMessage = String(message || "").trim();
    if (!userMessage) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const normalizedRole = normalizeRole(role);
    const localReply = getLocalReply(userMessage, normalizedRole);
    if (localReply) {
      return NextResponse.json({ reply: localReply });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured." }, { status: 500 });
    }

    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const contents = cleanHistory(history);
    contents.push({ role: "user", parts: [{ text: userMessage }] });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "You are the Smart Task Allocation assistant.",
              `Current user role: ${roleNames[normalizedRole] || normalizedRole}.`,
              roleContext[normalizedRole] || roleContext.manager,
              "Answer in a helpful, concise way for this web app.",
              "Do not invent live database values. If the user asks for exact current records, tell them where to check in the app.",
              "Mention navigation targets only if they exist: Admin Panel, User Accounts, Security Logs, Audit Logs, Global Parameters, Staff Profiles, Task Requests, Reports, My Tasks, New Request.",
              "Keep replies under 90 words unless the user asks for detail.",
            ].join(" "),
          }],
        },
        contents,
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 300,
        },
      }),
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || "Gemini request failed." }, { status: response.status });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return NextResponse.json({ error: "Gemini returned an empty reply." }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch (err) {
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "Gemini request timed out. Check your network connection, API key, and model name." }, { status: 504 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
