"use client";
import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import RequireRole from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";

function rangeFor(type, dateString){
 const d=new Date(dateString||new Date()); let start,end;
 if(type==='daily'){start=new Date(d.getFullYear(),d.getMonth(),d.getDate()); end=new Date(start); end.setDate(end.getDate()+1);}
 else if(type==='weekly'){const day=d.getDay()||7; start=new Date(d); start.setDate(d.getDate()-day+1); start.setHours(0,0,0,0); end=new Date(start); end.setDate(start.getDate()+7);}
 else {start=new Date(d.getFullYear(),d.getMonth(),1); end=new Date(d.getFullYear(),d.getMonth()+1,1);}
 return {start:start.toISOString(), end:end.toISOString()};
}
export default function ReportsPage(){
 const [type,setType]=useState('daily'); const [date,setDate]=useState(new Date().toISOString().slice(0,10)); const [tasks,setTasks]=useState([]); const [staff,setStaff]=useState([]);
 useEffect(()=>{generate();},[]);
 async function generate(){ const r=rangeFor(type,date); const [{data:t},{data:s}]=await Promise.all([supabase.from('task_requests').select('*, staff_profiles(staff_name)').gte('created_at',r.start).lt('created_at',r.end).order('created_at',{ascending:false}), supabase.from('staff_profiles').select('*').order('current_workload',{ascending:false})]); setTasks(t||[]); setStaff(s||[]); }
 const summary=useMemo(()=>({total:tasks.length,pending:tasks.filter(t=>t.status==='pending').length,approved:tasks.filter(t=>t.status==='approved').length,completed:tasks.filter(t=>t.status==='completed').length,rejected:tasks.filter(t=>t.status==='rejected').length}),[tasks]);
 return <RequireRole roles={["manager"]}><Nav role="manager"/><main className="page"><h1>Operational Reports</h1><div className="card"><div className="row"><select className="input" style={{maxWidth:200}} value={type} onChange={e=>setType(e.target.value)}><option value="daily">Daily Report</option><option value="weekly">Weekly Report</option><option value="monthly">Monthly Report</option></select><input className="input" style={{maxWidth:220}} type="date" value={date} onChange={e=>setDate(e.target.value)} /><button className="btn" onClick={generate}>Generate</button></div></div><div className="grid2"><div className="card"><h2>{summary.total}</h2><p>Total Tasks</p></div><div className="card"><h2>{summary.pending}</h2><p>Pending</p></div><div className="card"><h2>{summary.approved}</h2><p>Approved</p></div><div className="card"><h2>{summary.completed}</h2><p>Completed</p></div><div className="card"><h2>{summary.rejected}</h2><p>Rejected</p></div></div><div className="card"><h2>Task Allocation Records</h2><table><thead><tr><th>Task</th><th>Status</th><th>Assigned Staff</th><th>Priority</th><th>Date</th></tr></thead><tbody>{tasks.map(t=><tr key={t.id}><td>{t.title}</td><td>{t.status}</td><td>{t.staff_profiles?.staff_name||'-'}</td><td>{t.priority}</td><td>{new Date(t.created_at).toLocaleString()}</td></tr>)}</tbody></table></div><div className="card"><h2>Staff Workload Summary</h2><table><thead><tr><th>Staff</th><th>Availability</th><th>Current Workload</th><th>Weekly Hours</th><th>Rating</th></tr></thead><tbody>{staff.map(s=><tr key={s.id}><td>{s.staff_name}</td><td>{s.availability}</td><td>{s.current_workload}</td><td>{s.weekly_working_hours}/{s.max_weekly_hours}</td><td>{s.performance_rating}</td></tr>)}</tbody></table></div></main></RequireRole>;
}
