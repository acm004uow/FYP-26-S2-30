import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request) {
  try {
    const { email, password, full_name, business_name, role } = await request.json();
    if (!email || !password || !full_name || !role) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const supabase = createSupabaseAdmin();
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    let creatorBusinessName = null;

    if (token) {
      const { data: authData } = await supabase.auth.getUser(token);
      const creatorId = authData?.user?.id;

      if (creatorId) {
        const { data: creatorProfile } = await supabase
          .from("profiles")
          .select("business_name")
          .eq("id", creatorId)
          .single();

        creatorBusinessName = creatorProfile?.business_name || null;
      }
    }

    const resolvedBusinessName = business_name || creatorBusinessName || null;
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, business_name: resolvedBusinessName, role } });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const user = data.user;
    const { error: profileError } = await supabase.from("profiles").upsert({ id: user.id, email, full_name, business_name: resolvedBusinessName, role, status: "active" });
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });
    if (role === "staff_member") {
      await supabase.from("staff_profiles").insert({ user_id: user.id, staff_name: full_name, email, skills: [], status: "active" });
    }
    await supabase.from("audit_logs").insert({ user_id: user.id, action: "create_user_account", details: `${email} as ${role}` });
    return NextResponse.json({ ok: true, user_id: user.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
