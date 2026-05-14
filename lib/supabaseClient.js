"use client";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !url.startsWith("http")) {
  throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL. Set it in .env.local, for example: https://your-project-ref.supabase.co");
}

if (!anon || anon.startsWith("your_")) {
  throw new Error("Invalid NEXT_PUBLIC_SUPABASE_ANON_KEY. Set your real Supabase anon key in .env.local.");
}

export const supabase = createClient(url, anon);
