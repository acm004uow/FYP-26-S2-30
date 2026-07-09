import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabaseAdmin";
import { deriveToken, minuteBucket } from "@/lib/attendanceQr";
import crypto from "crypto";

async function getOwnerProfile(request, supabase) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: authData } = await supabase.auth.getUser(token);
  const callerId = authData?.user?.id;
  if (!callerId) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role,attendance_qr_token")
    .eq("id", callerId)
    .single();
  return profile || null;
}

function buildCheckinUrl(request, token) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL;
  // Browsers only send an Origin header on cross-origin or state-changing (POST) requests —
  // a same-origin GET fetch (used to load/refresh the QR) omits it, so it can't be relied on alone.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  const siteUrl = envUrl || origin || (host ? `${proto}://${host}` : null);
  return siteUrl ? `${siteUrl.replace(/\/$/, "")}/attendance-checkin?token=${token}` : null;
}

async function ensureSecret(supabase, profile) {
  let secret = profile.attendance_qr_token;
  if (!secret) {
    secret = crypto.randomUUID();
    await supabase
      .from("profiles")
      .update({ attendance_qr_token: secret, attendance_qr_rotated_at: new Date().toISOString() })
      .eq("id", profile.id);
  }
  return secret;
}

export async function GET(request) {
  try {
    const supabase = createSupabaseAdmin();
    const profile = await getOwnerProfile(request, supabase);
    if (!profile || profile.role !== "system_admin") {
      return NextResponse.json({ error: "Only the owner can manage the office QR code." }, { status: 403 });
    }

    const secret = await ensureSecret(supabase, profile);
    const token = deriveToken(secret, minuteBucket());
    const rotatesInSeconds = 60 - (Math.floor(Date.now() / 1000) % 60);

    return NextResponse.json({ token, checkin_url: buildCheckinUrl(request, token), rotates_in_seconds: rotatesInSeconds });
  } catch (err) {
    console.error("Fetch attendance QR token failed:", err);
    return NextResponse.json({ error: err.message || "Could not load the office QR code." }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    const supabase = createSupabaseAdmin();
    const profile = await getOwnerProfile(request, supabase);
    if (!profile || profile.role !== "system_admin") {
      return NextResponse.json({ error: "Only the owner can manage the office QR code." }, { status: 403 });
    }

    const secret = crypto.randomUUID();
    const { error } = await supabase
      .from("profiles")
      .update({ attendance_qr_token: secret, attendance_qr_rotated_at: new Date().toISOString() })
      .eq("id", profile.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from("audit_logs").insert({ user_id: profile.id, action: "reset_attendance_qr_secret", details: "Office attendance QR secret reset — all previous codes invalidated" });

    const token = deriveToken(secret, minuteBucket());
    const rotatesInSeconds = 60 - (Math.floor(Date.now() / 1000) % 60);

    return NextResponse.json({ token, checkin_url: buildCheckinUrl(request, token), rotates_in_seconds: rotatesInSeconds });
  } catch (err) {
    console.error("Reset attendance QR secret failed:", err);
    return NextResponse.json({ error: err.message || "Could not reset the office QR secret." }, { status: 400 });
  }
}
