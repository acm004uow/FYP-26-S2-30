"use client";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import RequireRole from "@/components/RequireRole";
import StatusBadge from "@/components/StatusBadge";
import { supabase } from "@/lib/supabaseClient";

const empty = { email:"", password:"Password123!", full_name:"", role:"department_staff" };
export default function ManagerUsersPage() {
  const [users, setUsers] = useState([]); const [form, setForm] = useState(empty); const [search, setSearch] = useState("");
  const [editingUserId, setEditingUserId] = useState(null);
  const [draftRoles, setDraftRoles] = useState({});
  useEffect(()=>{load();},[]);
  async function load(){ const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending:false }); setUsers(data||[]); }
  async function createUser(e){
    e.preventDefault();
    const res = await fetch("/api/admin/create-user", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(form) });
    const json = await res.json();
    if(!res.ok) return alert(json.error || "Failed to create user");
    await supabase.from("audit_logs").insert({ action:"manager_create_user_account", details: form.email });
    setForm(empty); load();
  }
  function editUser(u){ setEditingUserId(u.id); setDraftRoles({ ...draftRoles, [u.id]: u.role }); }
  function cancelEdit(){ setEditingUserId(null); }
  async function updateRole(u){
    const role = draftRoles[u.id] || u.role;
    await supabase.from("profiles").update({ role }).eq("id", u.id);
    await supabase.from("audit_logs").insert({ action:"manager_update_user_account", details:`${u.email} role ${role}` });
    setEditingUserId(null);
    load();
  }
  async function suspend(u){ await supabase.from("profiles").update({ status:"suspended" }).eq("id", u.id); await supabase.from("audit_logs").insert({ action:"manager_suspend_user_account", details:u.email }); setEditingUserId(null); load(); }
  const filtered = users.filter(u => [u.full_name,u.email,u.role,u.status].join(" ").toLowerCase().includes(search.toLowerCase()));
  return <RequireRole roles={["manager"]}><Nav role="manager"/><main className="page"><h1>User Account Management</h1><div className="grid2"><div className="card"><h2>Create User Account</h2><form className="grid" onSubmit={createUser}>
    <input className="input" placeholder="Full name" value={form.full_name} onChange={e=>setForm({...form, full_name:e.target.value})} required />
    <input className="input" type="email" placeholder="Email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})} required />
    <input className="input" placeholder="Temporary password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} required />
    <select className="input" value={form.role} onChange={e=>setForm({...form, role:e.target.value})}><option value="manager">Manager</option><option value="department_staff">Department Staff</option><option value="staff_member">Staff Member</option><option value="system_admin">System Admin</option></select>
    <button className="btn">Create Account</button></form></div><div className="card"><h2>Search User Accounts</h2><input className="input" placeholder="Search by name, email, role, status" value={search} onChange={e=>setSearch(e.target.value)} /></div></div>
    <div className="card"><h2>View / Update / Suspend User Accounts</h2><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map(u=>{
      const isEditing = editingUserId === u.id;
      return <tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td><select className="input" value={draftRoles[u.id] || u.role} disabled={!isEditing} onChange={e=>setDraftRoles({...draftRoles, [u.id]: e.target.value})}><option value="manager">manager</option><option value="department_staff">department_staff</option><option value="staff_member">staff_member</option><option value="system_admin">system_admin</option></select></td><td><StatusBadge value={u.status}/></td><td className="row">{isEditing ? <><button className="btn success" onClick={()=>updateRole(u)}>Update</button><button className="btn danger" onClick={()=>suspend(u)}>Suspend</button><button className="btn secondary" onClick={cancelEdit}>Cancel</button></> : <button className="btn secondary" onClick={()=>editUser(u)}>Edit</button>}</td></tr>;
    })}</tbody></table></div>
  </main></RequireRole>;
}
