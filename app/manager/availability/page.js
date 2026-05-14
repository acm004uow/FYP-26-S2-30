"use client";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import RequireRole from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";
export default function AvailabilityPage(){ const [staff,setStaff]=useState([]); useEffect(()=>{load(); const channel=supabase.channel('staff_availability_changes').on('postgres_changes',{event:'UPDATE',schema:'public',table:'staff_profiles'},load).subscribe(); return()=>supabase.removeChannel(channel);},[]); async function load(){const {data}=await supabase.from('staff_profiles').select('*').order('staff_name'); setStaff(data||[]);} return <RequireRole roles={["manager"]}><Nav role="manager"/><main className="page"><h1>Real-Time Staff Availability</h1><div className="grid2">{staff.map(s=><div className="card" key={s.id}><h2>{s.staff_name}</h2><p><b>Availability:</b> {s.availability}</p><p><b>Region:</b> {s.assigned_region}</p><p><b>Workload:</b> {s.current_workload} tasks / {s.weekly_working_hours} hrs</p><p><b>Skills:</b> {(s.skills||[]).join(', ')}</p></div>)}</div></main></RequireRole>}
