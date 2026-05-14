import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const { user_id, new_password } = await request.json();
    if (!user_id || !new_password) return NextResponse.json({ error: "Missing user_id or new_password" }, { status: 400 });
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.auth.admin.updateUserById(user_id, { password: new_password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await supabase.from("security_logs").insert({ event_type: "password_reset", details: `Password reset for user ${user_id}` });
    await supabase.from("audit_logs").insert({ user_id, action: "reset_user_password", details: "Password reset by admin" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
