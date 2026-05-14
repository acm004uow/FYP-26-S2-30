"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const links = {
  manager: [
    ["Dashboard", "/manager/dashboard"], ["Staff", "/manager/staff"], ["Users", "/manager/users"],
    ["Tasks", "/manager/tasks"], ["Availability", "/manager/availability"], ["Reports", "/manager/reports"],
    ["Notifications", "/manager/notifications"], ["Chatbot", "/chatbot"]
  ],
  department_staff: [
    ["Dashboard", "/department/dashboard"], ["Create Task", "/department/create-task"],
    ["My Requests", "/department/tasks"], ["History", "/department/history"],
    ["Notifications", "/department/notifications"], ["Chatbot", "/chatbot"]
  ],
  staff_member: [
    ["Dashboard", "/staff/dashboard"], ["Availability", "/staff/availability"],
    ["My Tasks", "/staff/tasks"], ["Performance", "/staff/performance"],
    ["Notifications", "/staff/notifications"], ["Chatbot", "/chatbot"]
  ],
  system_admin: [
    ["Dashboard", "/admin/dashboard"], ["Users/Roles", "/admin/users"], ["Parameters", "/admin/parameters"],
    ["Security Logs", "/admin/security-logs"], ["Audit Logs", "/admin/audit-logs"], ["Chatbot", "/chatbot"]
  ]
};

export default function Nav({ role = "manager" }) {
  const router = useRouter();
  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }
  return (
    <nav className="nav">
      <Link className="brand" href="/login">Smart Task Allocation</Link>
      {(links[role] || []).map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
      <button className="btn danger" onClick={logout}>Logout</button>
    </nav>
  );
}
