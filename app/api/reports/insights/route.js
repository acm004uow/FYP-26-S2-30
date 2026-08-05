import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_ROLES = ["manager", "system_admin"];

export async function POST(request) {
  try {
    const { reportLabel, scope, metrics } = await request.json();
    if (!metrics || typeof metrics !== "object") {
      return NextResponse.json({ error: "Missing report metrics." }, { status: 400 });
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

    if (!callerProfile || callerProfile.status !== "active" || !ALLOWED_ROLES.includes(callerProfile.role)) {
      return NextResponse.json({ error: "Not authorized to generate report insights." }, { status: 403 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const systemPrompt = [
      "You are a business analyst summarizing an operations report for a cleaning-services company.",
      scope === "owner" ? "The reader owns the whole business." : "The reader manages one team within the business.",
      "You will be given report metrics as JSON, including this period's numbers and, where available, the percentage change versus the prior period of the same length.",
      "Write exactly 3 short insights. Praise genuine strengths, flag real problems (low ratings, falling completion rates, over/under-utilized staff), and stay concrete — reference the actual numbers you were given.",
      "Each insight has: tone ('positive', 'warning', or 'neutral'), title (2-4 words), message (one short sentence, max 20 words, no emojis).",
      "Respond with ONLY a JSON object: {\"insights\": [{\"tone\":...,\"title\":...,\"message\":...}, ...]} with exactly 3 items.",
    ].join(" ");

    const userContext = JSON.stringify({ reportLabel, metrics });

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
          temperature: 0.5,
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

    const insights = Array.isArray(parsed.insights)
      ? parsed.insights
        .filter(item => item && item.title && item.message)
        .map(item => ({
          tone: ["positive", "warning", "neutral"].includes(item.tone) ? item.tone : "neutral",
          title: String(item.title).slice(0, 60),
          message: String(item.message).slice(0, 200),
        }))
        .slice(0, 3)
      : [];

    if (insights.length === 0) return NextResponse.json({ error: "AI did not return any insights." }, { status: 502 });

    return NextResponse.json({ insights });
  } catch (err) {
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "AI request timed out. Try again." }, { status: 504 });
    }
    console.error("Generate report insights failed:", err);
    return NextResponse.json({ error: err.message || "Could not generate insights." }, { status: 400 });
  }
}
