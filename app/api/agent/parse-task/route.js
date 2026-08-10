import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { SERVICE_TYPES } from "@/lib/serviceTypes";

function isValidIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

// Turns a manager's shorthand note (e.g. "Cus Name - Saung, Location - 123456 #05-01, tomorrow
// 2pm") into structured single-task fields, for the Weekly Schedule grid's "Add Task > AI Agent"
// quick-add panel. Distinct from /api/agent/generate-task, which does the reverse (fields ->
// description text) for the full manual New Task form.
export async function POST(request) {
  try {
    const { hint } = await request.json();
    const trimmedHint = String(hint || "").trim();
    if (!trimmedHint) return NextResponse.json({ error: "Describe the task first." }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

    const { data: authData } = await supabase.auth.getUser(token);
    const callerId = authData?.user?.id;
    if (!callerId) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role,status,host_admin_id")
      .eq("id", callerId)
      .single();

    if (!callerProfile || callerProfile.status !== "active" || !["manager", "system_admin", "department_staff"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "Only an active manager, owner, or department staff account can use this." }, { status: 403 });
    }

    const hostAdminId = callerProfile.role === "system_admin" ? callerProfile.id : callerProfile.host_admin_id;
    if (!hostAdminId) return NextResponse.json({ error: "Could not resolve your company." }, { status: 400 });

    const { data: categoryRows } = await supabase
      .from("task_categories")
      .select("name")
      .eq("status", "active")
      .or(`host_admin_id.eq.${hostAdminId},host_admin_id.is.null`)
      .order("name");
    const serviceTypes = categoryRows?.length ? categoryRows.map((row) => row.name) : SERVICE_TYPES;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI task parsing is not configured (missing OPENAI_API_KEY)." }, { status: 500 });

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const todayWeekday = today.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

    const systemPrompt = [
      "You extract structured task details from a cleaning-services manager's shorthand note, for a single one-off job.",
      `Today is ${todayWeekday}, ${todayIso}. Resolve any relative date ("tomorrow", "next Monday", "this Friday") against that.`,
      `Valid service types: ${serviceTypes.join(", ")}. Pick the closest match, or "${serviceTypes[0]}" if the note gives no hint.`,
      "Respond with ONLY a JSON object with keys: customer_name (string, empty if not given), location (string — address, postal code, unit/floor, whatever was given, empty if not given), service_type (one of the valid service types), scheduled_date (YYYY-MM-DD, empty string if no date was given), scheduled_time (24-hour HH:MM, empty string if no time was given), estimated_hours (number, default 2 if not given), description (one short natural sentence summarizing the job for internal notes).",
    ].join(" ");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: trimmedHint },
          ],
          temperature: 0.2,
          max_tokens: 300,
          response_format: { type: "json_object" },
        }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      return NextResponse.json({ error: data?.error?.message || "AI request failed." }, { status: 502 });
    }

    let parsed;
    try {
      parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    } catch {
      return NextResponse.json({ error: "AI returned an invalid response." }, { status: 502 });
    }

    return NextResponse.json({
      customerName: String(parsed.customer_name || "").trim(),
      location: String(parsed.location || "").trim(),
      serviceType: serviceTypes.includes(parsed.service_type) ? parsed.service_type : serviceTypes[0],
      scheduledDate: isValidIsoDate(parsed.scheduled_date) ? parsed.scheduled_date : "",
      scheduledTime: isValidTime(parsed.scheduled_time) ? parsed.scheduled_time : "",
      estimatedHours: Number.isFinite(Number(parsed.estimated_hours)) && Number(parsed.estimated_hours) > 0 ? Number(parsed.estimated_hours) : 2,
      description: String(parsed.description || "").trim(),
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "AI request timed out. Try again." }, { status: 504 });
    }
    console.error("Parse task failed:", err);
    return NextResponse.json({ error: err.message || "Could not parse the task." }, { status: 400 });
  }
}
