"use client";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import RequireRole from "@/components/RequireRole";
import StatusBadge from "@/components/StatusBadge";
import { supabase } from "@/lib/supabaseClient";

const emptyForm = { staff_name:"", email:"", phone:"", skills:"", assigned_region:"", max_weekly_hours:40 };
export default function ManagerStaffPage() {
  const [staff, setStaff] = useState([]); const [form, setForm] = useState(emptyForm); const [editing, setEditing] = useState(null); const [search, setSearch] = useState("");
  useEffect(() => { load(); }, []);
  async function load() { const { data } = await supabase.from("staff_profiles").select("*").order("created_at", { ascending:false }); setStaff(data || []); }
  async function save(e) {
    e.preventDefault();
    const payload = { ...form, skills: String(form.skills || "").split(",").map(s=>s.trim()).filter(Boolean), max_weekly_hours: Number(form.max_weekly_hours || 40), is_suspended:false, status:"active" };
    if (editing) await supabase.from("staff_profiles").update(payload).eq("id", editing);
    else await supabase.from("staff_profiles").insert(payload);
    await supabase.from("audit_logs").insert({ action: editing ? "update_staff_profile" : "create_staff_profile", details: payload.staff_name });
    setForm(emptyForm); setEditing(null); load();
  }
  function edit(row) { setEditing(row.id); setForm({ ...row, skills: (row.skills || []).join(", ") }); }
  async function suspend(row) { await supabase.from("staff_profiles").update({ is_suspended:true, status:"suspended", availability:"unavailable" }).eq("id", row.id); await supabase.from("audit_logs").insert({ action:"suspend_staff_profile", details: row.staff_name }); load(); }
  const filtered = staff.filter(s => [s.staff_name, s.email, s.assigned_region, ...(s.skills || [])].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <RequireRole roles={["manager"]}><Nav role="manager" /><main className="page"><h1>Staff Profile Management</h1><div className="grid2"><div className="card"><h2>{editing ? "Update Staff Profile" : "Create Staff Profile"}</h2><form onSubmit={save} className="grid">
    <input className="input" placeholder="Staff name" value={form.staff_name} onChange={e=>setForm({...form, staff_name:e.target.value})} required />
    <input className="input" placeholder="Email" value={form.email || ""} onChange={e=>setForm({...form, email:e.target.value})} />
    <input className="input" placeholder="Phone" value={form.phone || ""} onChange={e=>setForm({...form, phone:e.target.value})} />
    <input className="input" placeholder="Skills comma separated e.g. cleaning, plumbing" value={form.skills || ""} onChange={e=>setForm({...form, skills:e.target.value})} />
    <input className="input" placeholder="Assigned region/location" value={form.assigned_region || ""} onChange={e=>setForm({...form, assigned_region:e.target.value})} />
    <input className="input" type="number" placeholder="Max weekly hours" value={form.max_weekly_hours || 40} onChange={e=>setForm({...form, max_weekly_hours:e.target.value})} />
    <div className="row"><button className="btn">Save</button>{editing && <button type="button" className="btn secondary" onClick={()=>{setEditing(null); setForm(emptyForm);}}>Cancel</button>}</div>
  </form></div><div className="card"><h2>Search Staff Profiles</h2><input className="input" placeholder="Search by name, skill, region" value={search} onChange={e=>setSearch(e.target.value)} /></div></div>
  <div className="card"><table><thead><tr><th>Name</th><th>Skills</th><th>Region</th><th>Availability</th><th>Workload</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map(s=><tr key={s.id}><td>{s.staff_name}<br/><span className="small">{s.email}</span></td><td>{(s.skills||[]).join(", ")}</td><td>{s.assigned_region}</td><td>{s.availability}</td><td>{s.current_workload} tasks / {s.weekly_working_hours} hrs</td><td><StatusBadge value={s.status || (s.is_suspended ? "suspended" : "active")} /></td><td className="row"><button className="btn secondary" onClick={()=>edit(s)}>Update</button><button className="btn danger" onClick={()=>suspend(s)}>Suspend</button></td></tr>)}</tbody></table></div></main></RequireRole>;
}
