"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { isValidEmail } from "@/lib/emailValidation";

const allowedSignupRoles = new Set(["manager", "department_staff", "staff_member"]);

async function getOrCreateProfile(user, fallbackEmail) {
  const { data: existingProfile, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (existingProfile || (error && error.code !== "PGRST116")) return { profile: existingProfile, error };

  const metadata = user.user_metadata || {};
  const role = allowedSignupRoles.has(metadata.role) ? metadata.role : "staff_member";
  const fullName = metadata.full_name || fallbackEmail;
  const email = user.email || fallbackEmail;

  const { data: profile, error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    email,
    full_name: fullName,
    role,
    status: "active"
  }).select("*").single();

  if (insertError) return { profile: null, error: insertError };

  if (role === "staff_member") {
    await supabase.from("staff_profiles").insert({
      user_id: user.id,
      staff_name: fullName,
      email,
      skills: [],
      status: "active"
    });
  }

  return { profile, error: null };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    setVerified(new URLSearchParams(window.location.search).get("verified") === "1");
  }, []);

  async function login(e) {
    e.preventDefault();
    setError("");
    const trimmedEmail = email.trim();

    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      await supabase.from("security_logs").insert({ email: trimmedEmail, event_type: "failed_login", details: authError.message });
      setError(authError.message);
      return;
    }
    await supabase.from("security_logs").insert({ email: trimmedEmail, event_type: "successful_login", details: "User logged in" });
    const { profile, error: profileError } = await getOrCreateProfile(data.user, trimmedEmail);
    if (profileError || !profile || profile.status === "suspended") {
      setError("Profile not found or account suspended.");
      return;
    }
    const routes = {
      manager: "/manager/dashboard",
      department_staff: "/department/dashboard",
      staff_member: "/staff/dashboard",
      system_admin: "/admin/dashboard"
    };
    router.push(routes[profile.role] || "/login");
  }

  return (
    <main className="page" style={{maxWidth: 520}}>
      <div className="card">
        <h1 className="title">Smart Task Allocation Login</h1>
        <p className="small">Login with your existing account. The dashboard opens based on your role.</p>
        {verified && <p className="ok">Email verified successfully. You can login now.</p>}
        {error && <p className="error">{error}</p>}
        <form onSubmit={login} className="grid">
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {email && !isValidEmail(email) && <p className="field-error">Enter a valid email, for example name@example.com.</p>}
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn">Login</button>
        </form>
        <p className="auth-switch">
          Do not have an account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
