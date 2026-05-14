"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { isValidEmail } from "@/lib/emailValidation";

const roles = [
  { value: "manager", label: "Manager" },
  { value: "department_staff", label: "Department staff" },
  { value: "staff_member", label: "Casual staff" }
];

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "staff_member"
  });
  const [pendingEmail, setPendingEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function signup(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    const trimmedEmail = form.email.trim();
    const trimmedName = form.full_name.trim();

    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!trimmedName) {
      setError("Please enter your full name.");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: signupError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: form.password,
        options: {
          data: {
            full_name: trimmedName,
            role: form.role
          }
        }
      });

      if (signupError) {
        setError(signupError.message);
        return;
      }

      setPendingEmail(trimmedEmail);
      setMessage("A confirmation code was sent to your email. Enter the code below to verify your account.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmEmail(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    const code = verificationCode.trim();

    if (!code) {
      setError("Please enter the confirmation code from your email.");
      return;
    }

    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: code,
        type: "signup"
      });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      await supabase.auth.signOut();
      router.push("/login?verified=1");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: pendingEmail
      });

      if (resendError) {
        setError(resendError.message);
        return;
      }

      setMessage("A new confirmation code was sent to your email.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page" style={{maxWidth: 560}}>
      <div className="card">
        <h1 className="title">Create Account</h1>
        <p className="small">Sign up first, enter the confirmation code from your email, then login.</p>
        {error && <p className="error">{error}</p>}
        {message && <p className="ok">{message}</p>}
        {!pendingEmail ? (
          <form onSubmit={signup} className="grid">
            <input className="input" placeholder="Full name" value={form.full_name} onChange={(e) => update("full_name", e.target.value)} required />
            <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
            {form.email && !isValidEmail(form.email) && <p className="field-error">Enter a valid email, for example name@example.com.</p>}
            <input className="input" type="password" placeholder="Password" value={form.password} onChange={(e) => update("password", e.target.value)} required />
            <input className="input" type="password" placeholder="Confirm password" value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} required />
            <label className="field-label">
              Role
              <select className="input" value={form.role} onChange={(e) => update("role", e.target.value)}>
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </label>
            <button className="btn" disabled={loading}>{loading ? "Sending Code..." : "Sign Up"}</button>
          </form>
        ) : (
          <form onSubmit={confirmEmail} className="grid">
            <p className="small">Confirmation code sent to {pendingEmail}</p>
            <input className="input" inputMode="numeric" placeholder="Enter confirmation code" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} required />
            <button className="btn" disabled={loading}>{loading ? "Verifying..." : "Verify Email"}</button>
            <button className="btn secondary" type="button" onClick={resendCode} disabled={loading}>Resend Code</button>
          </form>
        )}
        <p className="auth-switch">
          Already have an account? <Link href="/login">Login</Link>
        </p>
      </div>
    </main>
  );
}
