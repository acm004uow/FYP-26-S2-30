import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { SERVICE_TYPES } from "@/lib/serviceTypes";

const VALID_PRIORITIES = ["low", "normal", "high", "urgent"];

function isValidIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

// Turns a customer's free-text "what you need" description (Step 1 of the booking wizard) into
// structured fields: service type, priority, a relative date/time hint resolved to real values,
// and estimated hours. Distinct from /api/agent/parse-task (manager-only, one host's categories) —
// this is customer-callable and reasons over the platform-wide active category list. Deliberately
// does NOT attempt to extract a requested staff member's name: that match happens client-side via
// findRequestedStaffByName against the real staff roster, so the roster never has to be sent here.
export async function POST(request) {
  try {
    const { text } = await request.json();
    const trimmedText = String(text || "").trim();
    if (!trimmedText) return NextResponse.json({ error: "Describe what you need first." }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

    const { data: authData } = await supabase.auth.getUser(token);
    const callerId = authData?.user?.id;
    if (!callerId) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role,status")
      .eq("id", callerId)
      .single();

    if (!callerProfile || callerProfile.status !== "active" || callerProfile.role !== "customer") {
      return NextResponse.json({ error: "Only an active customer account can use this." }, { status: 403 });
    }

    const { data: categoryRows } = await supabase
      .from("task_categories")
      .select("name")
      .eq("status", "active")
      .order("name");
    const serviceTypes = categoryRows?.length ? [...new Set(categoryRows.map((row) => row.name))] : SERVICE_TYPES;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI request parsing is not configured (missing OPENAI_API_KEY)." }, { status: 500 });

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const todayWeekday = today.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

    const systemPrompt = [
      "You extract structured booking details from a cleaning-services customer's own description of what they need.",
      `Today is ${todayWeekday}, ${todayIso}. Resolve any relative date ("tomorrow", "next Monday", "this Friday") against that. "Morning" means 09:00, "afternoon" means 13:00, "evening" means 17:00, unless a more specific time is given.`,
      `Valid service types: ${serviceTypes.join(", ")}. Pick the closest match to what the customer described, or "${serviceTypes[0]}" if the text gives no hint.`,
      'Priority must be one of "low", "normal", "high", "urgent" — read urgency from words like "urgent", "ASAP", "ideally today" (urgent/high) vs. no time pressure mentioned (normal).',
      "Respond with ONLY a JSON object with keys: service_type (one of the valid service types), priority (one of low/normal/high/urgent, default normal), scheduled_date (YYYY-MM-DD, empty string if no date was given), scheduled_time (24-hour HH:MM, empty string if no time was given), estimated_hours (number, default 2 if not given), description (one short natural sentence summarizing the job for internal notes, do not include any person's name in it).",
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
            { role: "user", content: trimmedText },
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
      serviceType: serviceTypes.includes(parsed.service_type) ? parsed.service_type : serviceTypes[0],
      priority: VALID_PRIORITIES.includes(parsed.priority) ? parsed.priority : "normal",
      scheduledDate: isValidIsoDate(parsed.scheduled_date) ? parsed.scheduled_date : "",
      scheduledTime: isValidTime(parsed.scheduled_time) ? parsed.scheduled_time : "",
      estimatedHours: Number.isFinite(Number(parsed.estimated_hours)) && Number(parsed.estimated_hours) > 0 ? Number(parsed.estimated_hours) : 2,
      description: String(parsed.description || "").trim(),
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "AI request timed out. Try again." }, { status: 504 });
    }
    console.error("Parse customer need failed:", err);
    return NextResponse.json({ error: err.message || "Could not understand that description." }, { status: 400 });
  }
}
