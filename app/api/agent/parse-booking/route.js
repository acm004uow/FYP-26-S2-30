import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

// As a customer types the free-text Description on the booking form, this infers which Service
// Type they mean (so they don't have to also work the dropdown) and pulls out any staff name they
// asked for by name (e.g. "I want Nan to do it") as a plain hint shown back to them. The name
// itself isn't matched against real staff here — that already happens automatically after booking
// creation via findRequestedStaffByName in lib/recommendationEngine.js, once a company/staff list
// is known. This route only powers the live "AI detected..." suggestion on the form itself.
export async function POST(request) {
  try {
    const { description, serviceTypes } = await request.json();
    const trimmedDescription = String(description || "").trim();
    const validServiceTypes = Array.isArray(serviceTypes) ? serviceTypes.filter(Boolean) : [];
    if (!trimmedDescription || trimmedDescription.length < 8) {
      return NextResponse.json({ error: "Description is too short to analyze yet." }, { status: 400 });
    }
    if (!validServiceTypes.length) {
      return NextResponse.json({ error: "No service types available to match against." }, { status: 400 });
    }

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

    if (!callerProfile || callerProfile.status !== "active") {
      return NextResponse.json({ error: "Your account isn't active." }, { status: 403 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI parsing is not configured (missing OPENAI_API_KEY)." }, { status: 500 });

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const systemPrompt = [
      "You read a customer's free-text description of a cleaning job and extract two things.",
      `1) service_type: the single closest match from this exact list: ${validServiceTypes.join(", ")}. If nothing in the text hints at a type, use an empty string.`,
      "2) requested_name: a specific person's name the customer asked for by name (e.g. \"I want Nan\", \"can Ali come again\"), empty string if none is mentioned. Do not guess a name from unrelated words.",
      "Respond with ONLY a JSON object with keys: service_type, requested_name.",
    ].join(" ");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
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
            { role: "user", content: trimmedDescription },
          ],
          temperature: 0.1,
          max_tokens: 150,
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
      serviceType: validServiceTypes.includes(parsed.service_type) ? parsed.service_type : "",
      requestedName: String(parsed.requested_name || "").trim(),
    });
  } catch (err) {
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "AI request timed out." }, { status: 504 });
    }
    console.error("Parse booking failed:", err);
    return NextResponse.json({ error: err.message || "Could not analyze the description." }, { status: 400 });
  }
}
