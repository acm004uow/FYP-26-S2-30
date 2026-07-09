import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { deriveToken, minuteBucket } from "@/lib/attendanceQr";

function todayUtcIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request) {
  try {
    const { token } = await request.json();
    if (!token) return NextResponse.json({ error: "Missing QR token." }, { status: 400 });

    const supabase = createSupabaseAdmin();
    const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!authHeader) return NextResponse.json({ error: "You must be logged in to check in." }, { status: 401 });

    const { data: authData } = await supabase.auth.getUser(authHeader);
    const callerId = authData?.user?.id;
    if (!callerId) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("id,role,status,host_admin_id")
      .eq("id", callerId)
      .single();

    if (!callerProfile || callerProfile.status !== "active") {
      return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
    }

    const hostAdminId = callerProfile.role === "system_admin" ? callerProfile.id : callerProfile.host_admin_id;
    if (!hostAdminId) return NextResponse.json({ error: "No company is associated with your account." }, { status: 400 });

    const { data: hostAdminProfile } = await supabase
      .from("profiles")
      .select("attendance_qr_token")
      .eq("id", hostAdminId)
      .single();

    const secret = hostAdminProfile?.attendance_qr_token;
    // Accept the current minute's code or the previous minute's, as a grace window so a
    // code that rotated mid-scan doesn't fail a legitimate check-in.
    const validTokens = secret ? [deriveToken(secret, minuteBucket()), deriveToken(secret, minuteBucket(-1))] : [];
    if (!validTokens.includes(token)) {
      return NextResponse.json({ error: "Invalid or expired QR code." }, { status: 400 });
    }

    const workDate = todayUtcIso();
    const { data: existing } = await supabase
      .from("attendance_records")
      .select("id,clocked_in_at,clocked_out_at")
      .eq("profile_id", callerId)
      .eq("work_date", workDate)
      .maybeSingle();

    if (existing?.clocked_in_at && existing?.clocked_out_at) {
      return NextResponse.json({ status: "already_completed", message: "You've already completed attendance for today.", record: existing });
    }

    const now = new Date().toISOString();
    let record;
    let status;

    if (!existing || !existing.clocked_in_at) {
      const { data, error } = await supabase
        .from("attendance_records")
        .upsert(
          { id: existing?.id, host_admin_id: hostAdminId, profile_id: callerId, work_date: workDate, clocked_in_at: now },
          { onConflict: "profile_id,work_date" }
        )
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      record = data;
      status = "clocked_in";
    } else {
      const { data, error } = await supabase
        .from("attendance_records")
        .update({ clocked_out_at: now, updated_at: now })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      record = data;
      status = "clocked_out";
    }

    await supabase.from("audit_logs").insert({
      user_id: callerId,
      action: status === "clocked_in" ? "attendance_check_in" : "attendance_check_out",
      details: `Office attendance for ${workDate}`,
    });

    return NextResponse.json({ status, record });
  } catch (err) {
    console.error("Attendance check-in failed:", err);
    return NextResponse.json({ error: err.message || "Check-in failed." }, { status: 400 });
  }
}
