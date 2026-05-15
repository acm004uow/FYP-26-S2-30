"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { chatbotReply } from "@/lib/chatbot";
import { supabase } from "@/lib/supabaseClient";

const links = {
  manager: [
    ["Dashboard", "/manager/dashboard"], ["Staff", "/manager/staff"], ["Users", "/manager/users"],
    ["Tasks", "/manager/tasks"], ["Availability", "/manager/availability"], ["Reports", "/manager/reports"],
    ["Notifications", "/manager/notifications"]
  ],
  department_staff: [
    ["Dashboard", "/department/dashboard"], ["Create Task", "/department/create-task"],
    ["My Requests", "/department/tasks"], ["History", "/department/history"],
    ["Notifications", "/department/notifications"]
  ],
  staff_member: [
    ["Dashboard", "/staff/dashboard"], ["Availability", "/staff/availability"],
    ["My Tasks", "/staff/tasks"], ["Performance", "/staff/performance"],
    ["Notifications", "/staff/notifications"]
  ],
  system_admin: [
    ["Dashboard", "/admin/dashboard"], ["Users/Roles", "/admin/users"], ["Parameters", "/admin/parameters"],
    ["Security Logs", "/admin/security-logs"], ["Audit Logs", "/admin/audit-logs"]
  ]
};

export default function Nav({ role = "manager" }) {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle();
    setProfile(data || { full_name: user.user_metadata?.full_name, email: user.email });
  }

  const profileName = profile?.full_name || profile?.email || "User";
  const fallbackInitials = profileName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase() || "U";

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function sendChat(e) {
    e.preventDefault();
    if (!message.trim()) return;
    const reply = chatbotReply(message, role);
    setChat([...chat, { from: "user", text: message }, { from: "bot", text: reply }]);
    setMessage("");
  }

  return (
    <>
      <nav className="nav">
        <Link className="brand" href="/login">Smart Task Allocation</Link>
        {(links[role] || []).map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        <div className="nav-profile-wrap">
          <button className="nav-profile" title={profileName} onClick={() => setShowProfileMenu(!showProfileMenu)}>
            <span>{fallbackInitials}</span>
          </button>
          {showProfileMenu && <button className="btn danger nav-logout" onClick={logout}>Logout</button>}
        </div>
      </nav>
      {showChatbot && <section className="chatbot-panel" aria-label="Chatbot support">
        <div className="chatbot-panel-head">
          <h2>Chatbot</h2>
          <button className="chatbot-close" onClick={() => setShowChatbot(false)} aria-label="Close chatbot">x</button>
        </div>
        <div className="chatbot-messages">
          {chat.length === 0 && <p className="small">Ask about reports, allocation status, task requests, availability, assigned tasks, proof upload, or recommendations.</p>}
          {chat.map((c, i) => <div className={`chatbot-message ${c.from}`} key={i}>{c.text}</div>)}
        </div>
        <form className="chatbot-form" onSubmit={sendChat}>
          <input className="input" value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your question..." />
          <button className="btn">Send</button>
        </form>
      </section>}
      <button className="chatbot-fab" onClick={() => setShowChatbot(!showChatbot)} aria-label="Open chatbot">
        <span className="chatbot-icon">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
    </>
  );
}
