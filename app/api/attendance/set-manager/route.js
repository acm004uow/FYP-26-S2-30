import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const { staff_profile_id, manager_id } = await request.json();
    if (!staff_profile_id) return NextResponse.json({ error: "Missing staff_profile_id." }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

    const { data: authData } = await supabase.auth.getUser(token);
    const callerId = authData?.user?.id;
    if (!callerId) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    if (!callerProfile || callerProfile.role !== "system_admin") {
      return NextResponse.json({ error: "Only the owner can assign staff to managers." }, { status: 403 });
    }

    const { data: staffProfile } = await supabase
      .from("staff_profiles")
      .select("id,host_admin_id")
      .eq("id", staff_profile_id)
      .single();

    if (!staffProfile || staffProfile.host_admin_id !== callerId) {
      return NextResponse.json({ error: "Staff member not found." }, { status: 404 });
    }

    if (manager_id) {
      const { data: managerProfile } = await supabase
        .from("profiles")
        .select("id,role,host_admin_id")
        .eq("id", manager_id)
        .single();
      if (!managerProfile || managerProfile.role !== "manager" || managerProfile.host_admin_id !== callerId) {
        return NextResponse.json({ error: "Invalid manager selected." }, { status: 400 });
      }
    }

    const { error } = await supabase
      .from("staff_profiles")
      .update({ manager_id: manager_id || null })
      .eq("id", staff_profile_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("audit_logs").insert({
      user_id: callerId,
      action: "assign_staff_manager",
      details: `Staff ${staff_profile_id} -> manager ${manager_id || "unassigned"}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Assign staff manager failed:", err);
    return NextResponse.json({ error: err.message || "Could not update manager assignment." }, { status: 400 });
  }
}
