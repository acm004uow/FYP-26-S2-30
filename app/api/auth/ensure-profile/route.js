import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const { access_token, fallback_role } = await request.json();
    if (!access_token) return NextResponse.json({ error: "Missing access token" }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(access_token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: userError?.message || "Invalid user session" }, { status: 401 });
    }

    const user = userData.user;
    const metadata = user.user_metadata || {};
    const profile = {
      id: user.id,
      full_name: metadata.full_name || user.email,
      business_name: metadata.business_name || null,
      email: user.email,
      role: metadata.role || fallback_role || "staff_member",
      status: "active",
    };

    const { error } = await supabase.from("profiles").upsert(profile);
    if (!error) return NextResponse.json({ profile });

    const { business_name, ...profileWithoutBusinessName } = profile;
    const { error: fallbackError } = await supabase.from("profiles").upsert(profileWithoutBusinessName);
    if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 400 });

    return NextResponse.json({ profile: profileWithoutBusinessName });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
