import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

const VALID_ROLES = new Set(["manager", "staff_member", "system_admin"]);
const VALID_STATUSES = new Set(["active", "inactive"]);

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { user_id, role, status } = await request.json();

    if (!token) return NextResponse.json({ error: "Missing admin session" }, { status: 401 });
    if (!user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    if (role && !VALID_ROLES.has(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    if (status && !VALID_STATUSES.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    if (!role && !status) return NextResponse.json({ error: "No role or status change requested" }, { status: 400 });

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

    if (profileError || requesterProfile?.role !== "system_admin" || requesterProfile.status !== "active") {
      return NextResponse.json({ error: "Only active system admins can manage account access" }, { status: 403 });
    }

    if (requesterId === user_id && (role || status === "inactive")) {
      return NextResponse.json({ error: "You cannot change or deactivate your own admin access" }, { status: 400 });
    }

    const { data: targetProfile, error: targetError } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,status,business_name,host_admin_id")
      .eq("id", user_id)
      .single();

    if (targetError || !targetProfile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const requesterHostAdminId = requesterProfile.host_admin_id || requesterId;
    const isSameHost = targetProfile.id === requesterId || targetProfile.host_admin_id === requesterHostAdminId;
    const isSameBusiness = requesterProfile.business_name && targetProfile.business_name === requesterProfile.business_name;
    if (!isSameHost && !isSameBusiness) {
      return NextResponse.json({ error: "This user is not under your system admin organisation" }, { status: 403 });
    }

    if (targetProfile.role === "system_admin" && (role && role !== "system_admin" || status === "inactive")) {
      const { count, error: countError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "system_admin")
        .eq("status", "active");

      if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });
      if ((count || 0) <= 1) {
        return NextResponse.json({ error: "At least one active system admin is required" }, { status: 400 });
      }
    }

    const updates = { updated_at: new Date().toISOString() };
    if (role) updates.role = role;
    if (status) updates.status = status;

    const { error: updateError } = await supabase.from("profiles").update(updates).eq("id", user_id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

    if (role) {
      const { data: authTarget } = await supabase.auth.admin.getUserById(user_id);
      await supabase.auth.admin.updateUserById(user_id, {
        user_metadata: { ...(authTarget?.user?.user_metadata || {}), role },
      });

      if (role === "staff_member") {
        const { data: staffProfile } = await supabase
          .from("staff_profiles")
          .select("id")
          .eq("user_id", user_id)
          .maybeSingle();

        if (!staffProfile) {
          await supabase.from("staff_profiles").insert({
            user_id,
            staff_name: targetProfile.full_name,
            email: targetProfile.email,
            skills: [],
            status: "active",
          });
        }
      }
    }

    const details = [
      role ? `role ${targetProfile.role} -> ${role}` : null,
      status ? `status ${targetProfile.status} -> ${status}` : null,
    ].filter(Boolean).join("; ");

    const action = status === "inactive"
      ? "deactivate_user_account"
      : status === "active"
        ? "reactivate_user_account"
        : "manage_user_role";

    await supabase.from("audit_logs").insert({
      user_id,
      action,
      details: `${targetProfile.email}: ${details}`,
    });

    if (status) {
      await supabase.from("security_logs").insert({
        email: targetProfile.email,
        event_type: action,
        details: `${requesterProfile.email || "System admin"} changed account status to ${status}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
