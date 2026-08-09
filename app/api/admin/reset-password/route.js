import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { user_id, new_password } = await request.json();
    if (!user_id || !new_password) return NextResponse.json({ error: "Missing user_id or new_password" }, { status: 400 });
    if (!token) return NextResponse.json({ error: "Missing admin session" }, { status: 401 });

    const supabase = createSupabaseAdmin();
    const { data: requesterData, error: requesterError } = await supabase.auth.getUser(token);
    if (requesterError || !requesterData?.user) {
      return NextResponse.json({ error: "Invalid admin session" }, { status: 401 });
    }

    const requesterId = requesterData.user.id;
    const { data: requesterProfile, error: profileError } = await supabase
      .from("profiles")
      .select("role,status,email,business_name,host_admin_id")
      .eq("id", requesterId)
      .single();

    const isPlatformAdmin = requesterProfile?.role === "user_admin";
    if (profileError || requesterProfile.status !== "active" || !(requesterProfile?.role === "system_admin" || isPlatformAdmin)) {
      return NextResponse.json({ error: "Only active owners or platform admins can reset passwords" }, { status: 403 });
    }

    if (requesterId === user_id) {
      return NextResponse.json({ error: "Use your account settings to change your own password" }, { status: 400 });
    }

    const { data: targetProfile, error: targetError } = await supabase
      .from("profiles")
      .select("id,email,business_name,host_admin_id")
      .eq("id", user_id)
      .single();

    if (targetError || !targetProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // Platform admins can reset passwords across every company; owners stay scoped to their own.
    if (!isPlatformAdmin) {
      const requesterHostAdminId = requesterProfile.host_admin_id || requesterId;
      const isSameHost = targetProfile.host_admin_id === requesterHostAdminId;
      const isSameBusiness = requesterProfile.business_name && targetProfile.business_name === requesterProfile.business_name;
      if (!isSameHost && !isSameBusiness) {
        return NextResponse.json({ error: "This user is not under your organisation" }, { status: 403 });
      }
    }

    const { error } = await supabase.auth.admin.updateUserById(user_id, { password: new_password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const actor = requesterProfile.email || "admin";
    await supabase.from("security_logs").insert({ email: targetProfile.email, event_type: "password_reset", details: `Password reset by ${actor}` });
    await supabase.from("audit_logs").insert({ user_id, action: "reset_user_password", details: `Password reset by ${actor}` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
