import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

function fallbackDetails() {
  return { source: "default", description: "", notes: "" };
}

export async function POST(request) {
  try {
    const { customerName, customerEmail, serviceType, location, scheduledDate, scheduledTime, estimatedHours } = await request.json();
    if (!customerName) return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    if (!location) return NextResponse.json({ error: "Location is required." }, { status: 400 });

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

    if (!callerProfile || callerProfile.status !== "active" || !["manager", "system_admin"].includes(callerProfile.role)) {
      return NextResponse.json({ error: "Only an active manager or owner can use this." }, { status: 403 });
    }

    const hostAdminId = callerProfile.role === "system_admin" ? callerProfile.id : callerProfile.host_admin_id;
    if (!hostAdminId) return NextResponse.json({ error: "Could not resolve your company." }, { status: 400 });

    // 1. Reuse the customer's most recent booking description/notes on file, if we can find one.
    let matchedCustomerId = null;
    if (customerEmail) {
      const { data: matchedCustomer } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "customer")
        .eq("email", customerEmail.trim().toLowerCase())
        .maybeSingle();
      matchedCustomerId = matchedCustomer?.id || null;
    }

    let historyQuery = supabase
      .from("bookings")
      .select("description,notes")
      .eq("host_admin_id", hostAdminId)
      .not("description", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    historyQuery = matchedCustomerId
      ? historyQuery.eq("customer_id", matchedCustomerId)
      : historyQuery.ilike("guest_name", customerName.trim());

    const { data: historyRows } = await historyQuery;
    const previous = historyRows?.[0];

    if (previous?.description) {
      return NextResponse.json({ source: "history", description: previous.description, notes: previous.notes || "" });
    }

    // 2. No usable history — ask the AI to draft a short description/notes for this specific task.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json(fallbackDetails());

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const systemPrompt = [
      "You help a cleaning-services manager quickly draft the description and notes for a task they are creating manually.",
      "The manager has already chosen the service type, location, schedule, and estimated hours themselves — do not restate those verbatim, just use them for context.",
      "Respond with ONLY a JSON object with keys: description (one short, natural sentence describing the job), notes (a short optional string, can be empty).",
    ].join(" ");

    const userContext = [
      `Customer: ${customerName}.`,
      `Service type: ${serviceType || "unspecified"}.`,
      `Location: ${location}.`,
      `Scheduled: ${scheduledDate || "unspecified date"} ${scheduledTime || "unspecified time"}.`,
      `Estimated hours: ${estimatedHours || "unspecified"}.`,
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
            { role: "user", content: userContext },
          ],
          temperature: 0.4,
          max_tokens: 200,
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
      source: "ai",
      description: parsed.description || "",
      notes: parsed.notes || "",
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "AI request timed out. Try again." }, { status: 504 });
    }
    console.error("Generate task description failed:", err);
    return NextResponse.json({ error: err.message || "Could not generate a description." }, { status: 400 });
  }
}
