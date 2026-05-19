"use client";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import RequireRole from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";

const empty = { email: "", password: "Password123!", full_name: "", role: "department_staff" };

const roleLabels = {
  manager: "Manager",
  department_staff: "Department Staff",
  staff_member: "Staff Member",
  system_admin: "System Admin"
};

const permissions = {
  manager: "Manage Staff, Review Tasks, Generate Reports",
  department_staff: "Create Tasks, View History, Request Allocation",
  staff_member: "View Tasks, Update Availability",
  system_admin: "Manage Users, Configure Parameters"
};

function initials(name, email) {
  const source = (name || email || "User").trim();
  const parts = source.includes(" ") ? source.split(" ") : [source.slice(0, 2)];
  return parts.filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function prettyDate(value) {
  if (!value) return "No login recorded";
  return new Date(value).toLocaleString("en-SG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).replace(",", "");
}

export default function ManagerUsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");
  const [editingUserId, setEditingUserId] = useState(null);
  const [draftRoles, setDraftRoles] = useState({});
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setUsers(data || []);
  }

  async function createUser(e) {
    e.preventDefault();
    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const json = await res.json();
    if (!res.ok) return alert(json.error || "Failed to create user");
    await supabase.from("audit_logs").insert({ action: "manager_create_user_account", details: form.email });
    setForm(empty);
    setShowCreate(false);
    load();
  }

  function editUser(u) {
    setEditingUserId(u.id);
    setDraftRoles({ ...draftRoles, [u.id]: u.role });
  }

  function viewUser(u) {
    alert(`${u.full_name || "Unnamed user"}\n${u.email}\n${roleLabels[u.role] || u.role}\nStatus: ${u.status || "unknown"}`);
  }

  function cancelEdit() {
    setEditingUserId(null);
  }

  async function updateRole(u) {
    const role = draftRoles[u.id] || u.role;
    await supabase.from("profiles").update({ role }).eq("id", u.id);
    await supabase.from("audit_logs").insert({ action: "manager_update_user_account", details: `${u.email} role ${role}` });
    setEditingUserId(null);
    load();
  }

  async function suspend(u) {
    await supabase.from("profiles").update({ status: "suspended" }).eq("id", u.id);
    await supabase.from("audit_logs").insert({ action: "manager_suspend_user_account", details: u.email });
    setEditingUserId(null);
    load();
  }

  const filtered = users.filter(u => [u.full_name, u.email, u.role, u.status].join(" ").toLowerCase().includes(search.toLowerCase()));

  return (
    <RequireRole roles={["manager"]}>
      <Nav role="manager" />
      <main className="page manager-users-page">
        <section className="users-hero">
          <div>
            <h1>User Accounts</h1>
            <p>Manage system access and permissions</p>
          </div>
          <button className="btn create-user-btn" onClick={() => setShowCreate(!showCreate)}>
            <span aria-hidden="true">+</span> Create User Account
          </button>
        </section>

        {showCreate && (
          <section className="card create-user-panel">
            <h2>Create User Account</h2>
            <form className="create-user-form" onSubmit={createUser}>
              <input className="input" placeholder="Full name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required />
              <input className="input" type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
              <input className="input" placeholder="Temporary password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
              <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="manager">Manager</option>
                <option value="department_staff">Department Staff</option>
                <option value="staff_member">Staff Member</option>
                <option value="system_admin">System Admin</option>
              </select>
              <button className="btn">Create Account</button>
            </form>
          </section>
        )}

        <label className="user-search">
          <span className="ui-icon icon-search" aria-hidden="true"></span>
          <input placeholder="Search by username, email, or role..." value={search} onChange={e => setSearch(e.target.value)} />
        </label>

        <section className="user-card-grid">
          {filtered.map(u => {
            const isEditing = editingUserId === u.id;
            const status = u.status || "active";
            return (
              <article className="user-account-card" key={u.id}>
                <header>
                  <div className="avatar">{initials(u.full_name, u.email)}</div>
                  <div className="user-card-title">
                    <h2>{u.email?.split("@")[0] || u.full_name}</h2>
                    <p><span className="ui-icon icon-user" aria-hidden="true"></span>{roleLabels[u.role] || u.role}</p>
                  </div>
                  <span className={`status-pill ${status}`}>{status}</span>
                </header>

                <div className="user-card-details">
                  <p><span className="ui-icon icon-mail" aria-hidden="true"></span>{u.email}</p>
                  <p><span className="ui-icon icon-user" aria-hidden="true"></span>Linked: {u.full_name || "Not linked"}</p>
                  <p><span className="ui-icon icon-clock" aria-hidden="true"></span>Last login: {prettyDate(u.updated_at || u.created_at)}</p>
                </div>

                <div className="permission-block">
                  <span><span className="ui-icon icon-key" aria-hidden="true"></span>Permissions</span>
                  {isEditing ? (
                    <div className="edit-role-row">
                      <select className="input" value={draftRoles[u.id] || u.role} onChange={e => setDraftRoles({ ...draftRoles, [u.id]: e.target.value })}>
                        <option value="manager">Manager</option>
                        <option value="department_staff">Department Staff</option>
                        <option value="staff_member">Staff Member</option>
                        <option value="system_admin">System Admin</option>
                      </select>
                      <button className="btn success" onClick={() => updateRole(u)}>Update</button>
                      <button className="btn secondary" onClick={cancelEdit}>Cancel</button>
                    </div>
                  ) : (
                    <p>{permissions[u.role] || "Standard Access"}</p>
                  )}
                </div>

                <footer>
                  <button className="action-btn view" onClick={() => viewUser(u)}><span className="ui-icon icon-eye" aria-hidden="true"></span>View</button>
                  <button className="action-btn edit" onClick={() => editUser(u)}><span className="ui-icon icon-edit" aria-hidden="true"></span>Edit</button>
                  <button className="action-btn suspend" onClick={() => suspend(u)} disabled={status === "suspended"}>Suspend</button>
                </footer>
              </article>
            );
          })}
        </section>
      </main>
    </RequireRole>
  );
}
