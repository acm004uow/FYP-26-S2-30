import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchGooglePlaceRating } from "@/lib/googlePlaces";

// Owner-facing: link a Google Business Profile listing to their company (or just re-pull the
// rating for one already linked) and cache it on profiles.google_*. This is the only place a
// Google Places "details" call happens outside the daily cron — never called from the customer
// booking page, which only ever reads the cached columns.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const supabase = createSupabaseAdmin();
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

    const { data: authData } = await supabase.auth.getUser(token);
    const callerId = authData?.user?.id;
    if (!callerId) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role,status,google_place_id")
      .eq("id", callerId)
      .single();

    if (!callerProfile || callerProfile.status !== "active" || callerProfile.role !== "system_admin") {
      return NextResponse.json({ error: "Only the owner can link a Google listing." }, { status: 403 });
    }

    const placeId = String(body.placeId || callerProfile.google_place_id || "").trim();
    if (!placeId) return NextResponse.json({ error: "No Google listing linked yet — search and pick one first." }, { status: 400 });

    const place = await fetchGooglePlaceRating(placeId);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        google_place_id: place.placeId,
        google_place_name: place.name,
        google_rating: place.rating,
        google_rating_count: place.userRatingCount,
        google_rating_synced_at: new Date().toISOString(),
      })
      .eq("id", callerId);

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({
      placeId: place.placeId,
      name: place.name,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
    });
  } catch (err) {
    console.error("Places refresh failed:", err);
    return NextResponse.json({ error: err.message || "Could not refresh the Google rating." }, { status: 400 });
  }
}
