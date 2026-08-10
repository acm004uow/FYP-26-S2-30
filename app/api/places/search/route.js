import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { searchGooglePlaces } from "@/lib/googlePlaces";

// Owner-facing lookup used from Marketing Page: "find my business on Google" so the owner can pick
// their real listing instead of us guessing one. Only returns candidates — nothing is saved here.
export async function POST(request) {
  try {
    const { query } = await request.json();
    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) return NextResponse.json({ error: "Type your business name (and city) first." }, { status: 400 });

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
      return NextResponse.json({ error: "Only the owner can link a Google listing." }, { status: 403 });
    }

    const results = await searchGooglePlaces(trimmedQuery);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Places search failed:", err);
    return NextResponse.json({ error: err.message || "Could not search Google Places." }, { status: 400 });
  }
}
