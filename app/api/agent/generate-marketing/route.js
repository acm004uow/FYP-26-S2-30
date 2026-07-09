import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const { businessName, serviceRates, currentDescription, instruction } = await request.json();
    if (!businessName) return NextResponse.json({ error: "Business name is required." }, { status: 400 });
    if (instruction && !currentDescription) return NextResponse.json({ error: "Generate a description first, then ask for changes." }, { status: 400 });

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

    if (!callerProfile || callerProfile.status !== "active" || callerProfile.role !== "system_admin") {
      return NextResponse.json({ error: "Only the owner can use this." }, { status: 403 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 500 });

    const offeredServices = Object.entries(serviceRates || {})
      .filter(([, price]) => price !== undefined && price !== null && price !== '' && Number(price) > 0)
      .map(([type]) => type);

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const systemPrompt = instruction
      ? [
          "You revise marketing copy for SME cleaning-service businesses based on the owner's feedback.",
          "You will be given the current description and an instruction describing what to change. Apply only that change, keep everything else the owner liked intact, and keep it 2-3 sentences, friendly and professional, no emojis, no markdown.",
          "Respond with ONLY a JSON object with one key: description.",
        ].join(" ")
      : [
          "You write short, appealing marketing copy for SME cleaning-service businesses.",
          "Respond with ONLY a JSON object with one key: description (2-3 sentences, friendly and professional, no emojis, no markdown).",
        ].join(" ");

    const userContext = instruction
      ? [
          `Business name: ${businessName}.`,
          `Current description: "${currentDescription}".`,
          `Owner's instruction: ${instruction}`,
        ].join(" ")
      : [
          `Business name: ${businessName}.`,
          offeredServices.length ? `Services offered: ${offeredServices.join(", ")}.` : "No specific services listed yet — write generally about cleaning services.",
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
          temperature: 0.6,
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

    if (!parsed.description) return NextResponse.json({ error: "AI did not return a description." }, { status: 502 });

    return NextResponse.json({ description: parsed.description });
  } catch (err) {
    if (err.name === "AbortError") {
      return NextResponse.json({ error: "AI request timed out. Try again." }, { status: 504 });
    }
    console.error("Generate marketing description failed:", err);
    return NextResponse.json({ error: err.message || "Could not generate a description." }, { status: 400 });
  }
}
