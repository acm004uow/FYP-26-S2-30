import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { findRequestedStaffByName } from "@/lib/recommendationEngine";
import { getConflictingStaffIds } from "@/lib/staffAvailability";

// Powers the "Noted: request for David — is he free then?" live check on the customer booking
// form. Only ever tells the customer yes/no for the one name they already typed themselves (never
// lists staff or exposes anyone else's schedule), checked against every other assigned booking for
// that company on that date — the same conflict logic the recommendation engine and manual
// assignment UI use, just read-only here.
export async function POST(request) {
  try {
    const { companyId, staffName, date, time, hours } = await request.json();
    if (!companyId || !staffName || !date) {
      return NextResponse.json({ matched: false });
    }

    const supabase = createSupabaseAdmin();
    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "You must be logged in." }, { status: 401 });

    const { data: authData } = await supabase.auth.getUser(token);
    if (!authData?.user?.id) return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });

    const { data: staffRows } = await supabase
      .from("staff_profiles")
      .select("id,staff_name")
      .eq("host_admin_id", companyId)
      .eq("status", "active")
      .eq("is_suspended", false);

    const match = findRequestedStaffByName(staffName, staffRows || []);
    if (!match) return NextResponse.json({ matched: false });

    const { data: existingBookings } = await supabase
      .from("bookings")
      .select("id,assigned_staff_id,scheduled_date,scheduled_time,estimated_hours")
      .eq("host_admin_id", companyId)
      .eq("scheduled_date", date)
      .not("assigned_staff_id", "is", null)
      .in("status", ["pending", "approved"]);

    const conflicting = getConflictingStaffIds(
      { scheduled_date: date, scheduled_time: time || null, estimated_hours: hours },
      existingBookings || []
    );

    return NextResponse.json({
      matched: true,
      staffId: match.id,
      staffName: match.staff_name,
      available: time ? !conflicting.has(match.id) : null,
    });
  } catch (err) {
    console.error("Staff availability check failed:", err);
    return NextResponse.json({ matched: false });
  }
}
