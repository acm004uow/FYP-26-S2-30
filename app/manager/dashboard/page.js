"use client";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import RequireRole from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";

export default function ManagerDashboard() {
  const [stats, setStats] = useState({ staff: 0, pending: 0, approved: 0, completed: 0, unread: 0 });
  useEffect(() => { load(); }, []);
  async function load() {
    const [{ count: staff }, { count: pending }, { count: approved }, { count: completed }, { data: userData }] = await Promise.all([
      supabase.from("staff_profiles").select("id", { count: "exact", head: true }).eq("is_suspended", false),
      supabase.from("task_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("task_requests").select("id", { count: "exact", head: true }).eq("status", "approved"),
      supabase.from("task_requests").select("id", { count: "exact", head: true }).eq("status", "completed"),
      supabase.auth.getUser()
    ]);
    let unread = 0;
    if (userData?.user) {
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userData.user.id).eq("is_read", false);
      unread = count || 0;
    }
    setStats({ staff: staff || 0, pending: pending || 0, approved: approved || 0, completed: completed || 0, unread });
  }
  return <RequireRole roles={["manager"]}><Nav role="manager" /><main className="page"><h1>Manager Dashboard</h1><div className="grid2">
    <div className="card"><h2>{stats.staff}</h2><p>Active Staff Profiles</p></div>
    <div className="card"><h2>{stats.pending}</h2><p>Pending Task Requests</p></div>
    <div className="card"><h2>{stats.approved}</h2><p>Approved Tasks</p></div>
    <div className="card"><h2>{stats.completed}</h2><p>Completed Tasks</p></div>
    <div className="card"><h2>{stats.unread}</h2><p>Unread Notifications</p></div>
  </div></main></RequireRole>;
}
