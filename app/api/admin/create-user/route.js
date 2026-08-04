import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const { email, full_name, business_name, role, department_id } = await request.json();
    if (!email || !full_name || !role) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const supabase = createSupabaseAdmin();
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    let creatorBusinessName = null;
    let hostAdminId = null;

    if (token) {
      const { data: authData } = await supabase.auth.getUser(token);
      const creatorId = authData?.user?.id;

      if (creatorId) {
        let { data: creatorProfile, error: creatorProfileError } = await supabase
          .from("profiles")
          .select("role,status,business_name,host_admin_id")
          .eq("id", creatorId)
          .single();

        if (creatorProfileError) {
          const fallbackProfile = await supabase
            .from("profiles")
            .select("role,status,business_name")
            .eq("id", creatorId)
            .single();
          creatorProfile = fallbackProfile.data;
        }

        creatorBusinessName = creatorProfile?.business_name || null;
        hostAdminId = creatorProfile?.role === "system_admin"
          ? creatorId
          : creatorProfile?.host_admin_id || null;

        if (!hostAdminId && creatorBusinessName) {
          const { data: hostAdmin } = await supabase
            .from("profiles")
            .select("id")
            .eq("role", "system_admin")
            .eq("business_name", creatorBusinessName)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          hostAdminId = hostAdmin?.id || null;
        }
      }
    }

    const resolvedBusinessName = business_name || creatorBusinessName || null;
    const metadata = { full_name, role };
    if (resolvedBusinessName) metadata.business_name = resolvedBusinessName;
    if (hostAdminId) metadata.host_admin_id = hostAdminId;
    const origin = request.headers.get("origin");
    const siteUrl = origin || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL;
    const redirectTo = siteUrl ? `${siteUrl.replace(/\/$/, "")}/set-password` : undefined;
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: metadata,
      redirectTo,
    });
    if (error?.message?.toLowerCase().includes("already")) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const user = data.user;
    if (!user) return NextResponse.json({ error: "Invitation could not be created." }, { status: 400 });

    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: metadata,
    });

    const resolvedHostAdminId = role === "system_admin" && !hostAdminId ? user.id : hostAdminId;
    const profile = {
      id: user.id,
      email,
      full_name,
      business_name: resolvedBusinessName,
      host_admin_id: resolvedHostAdminId,
      role,
      status: "active",
      department_id: role === "department_staff" ? (department_id || null) : null,
    };
    const { error: profileError } = await supabase.from("profiles").upsert(profile);
    if (profileError) {
      const { host_admin_id, department_id: _departmentId, ...profileWithoutHostAdmin } = profile;
      const { error: fallbackProfileError } = await supabase.from("profiles").upsert(profileWithoutHostAdmin);
      if (fallbackProfileError) return NextResponse.json({ error: fallbackProfileError.message }, { status: 400 });
    }
    if (role === "staff_member") {
      const { data: existingStaffProfile } = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existingStaffProfile) {
        await supabase.from("staff_profiles").insert({ user_id: user.id, host_admin_id: resolvedHostAdminId, staff_name: full_name, email, department_id: department_id || null, status: "active" });
      }
    }
    await supabase.from("audit_logs").insert({ user_id: user.id, action: "invite_user_account", details: `${email} as ${role}` });
    return NextResponse.json({ ok: true, user_id: user.id });
  } catch (err) {
    console.error("Invite user account failed:", err);
    return NextResponse.json({ error: err.message || "Invitation failed." }, { status: 400 });
  }
}
