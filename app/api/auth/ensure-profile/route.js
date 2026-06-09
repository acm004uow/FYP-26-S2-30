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
    const resolvedRole = metadata.role || fallback_role || "staff_member";
    const profile = {
      id: user.id,
      full_name: metadata.full_name || user.email,
      business_name: metadata.business_name || null,
      host_admin_id: resolvedRole === "system_admin" ? user.id : metadata.host_admin_id || null,
      email: user.email,
      role: resolvedRole,
      status: "active",
    };

    const { error } = await supabase.from("profiles").upsert(profile);
    if (!error) return NextResponse.json({ profile });

    const { business_name, host_admin_id, ...profileWithoutOwnership } = profile;
    const { error: fallbackError } = await supabase.from("profiles").upsert(profileWithoutOwnership);
    if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 400 });

    return NextResponse.json({ profile: profileWithoutOwnership });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
