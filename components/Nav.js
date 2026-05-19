"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { chatbotReply } from "@/lib/chatbot";
import { supabase } from "@/lib/supabaseClient";

const links = {
  manager: [
    ["Dashboard", "/manager/dashboard", "grid"], ["Staff Profiles", "/manager/staff", "users"], ["User Accounts", "/manager/users", "user-cog"],
    ["Task Requests", "/manager/tasks", "clipboard"], ["Reports", "/manager/reports", "report"]
  ],
  department_staff: [
    ["Dashboard", "/department/dashboard", "grid"], ["Create Task", "/department/create-task", "clipboard"],
    ["My Requests", "/department/tasks", "report"], ["History", "/department/history", "clock"]
  ],
  staff_member: [
    ["Dashboard", "/staff/dashboard", "grid"], ["Availability", "/staff/availability", "clock"],
    ["My Tasks", "/staff/tasks", "clipboard"], ["Performance", "/staff/performance", "report"]
  ],
  system_admin: [
    ["Dashboard", "/admin/dashboard", "grid"], ["Users/Roles", "/admin/users", "user-cog"], ["Parameters", "/admin/parameters", "clipboard"],
    ["Security Logs", "/admin/security-logs", "report"], ["Audit Logs", "/admin/audit-logs", "report"]
  ]
};

const roleTitles = {
  manager: "Manager",
  department_staff: "Department Staff",
  staff_member: "Staff Member",
  system_admin: "System Admin"
};

const notificationLinks = {
  manager: "/manager/notifications",
  department_staff: "/department/notifications",
  staff_member: "/staff/notifications"
};

function Icon({ name }) {
  return <span className={`nav-icon nav-icon-${name || "grid"}`} aria-hidden="true"></span>;
}

export default function Nav({ role = "manager" }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showChatbot, setShowChatbot] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    let channel;
    async function initNav() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await loadUnreadNotifications(user.id);
      channel = supabase
        .channel(`nav_notifications_${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => loadUnreadNotifications(user.id))
        .subscribe();
    }
    initNav();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  async function loadUnreadNotifications(userId) {
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false);
    setUnreadNotifications(count || 0);
  }

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
        <Link className="brand" href={`/${role === "manager" ? "manager" : role === "system_admin" ? "admin" : role === "department_staff" ? "department" : "staff"}/dashboard`}>
          <span className="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
          <span><strong>Smart Task Allocation</strong><small>{roleTitles[role] || "User"}</small></span>
        </Link>
        <div className="nav-links">
          {(links[role] || []).map(([label, href, icon]) => (
            <Link key={href} className={pathname === href ? "active" : ""} href={href}>
              <Icon name={icon} />{label}
            </Link>
          ))}
        </div>
        <div className="nav-actions">
          {notificationLinks[role] && (
            <Link className="nav-bell" href={notificationLinks[role]} aria-label="Notifications">
              <span className="nav-icon nav-icon-bell" aria-hidden="true"></span>
              {unreadNotifications > 0 && <span className="nav-dot"></span>}
            </Link>
          )}
          <button className="nav-logout" onClick={logout}><span aria-hidden="true">{"->"}</span> Logout</button>
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
