"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function RequireRole({ roles, children }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", user.id).single();
      if (!profile || profile.status !== "active" || !roles.includes(profile.role)) {
        router.push("/login");
        return;
      }
      setReady(true);
    }
    check();
  }, [router, roles]);

  if (!ready) return <main className="page"><p>Checking access...</p></main>;
  return children;
}
