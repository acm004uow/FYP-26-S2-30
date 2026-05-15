"use client";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import RequireRole from "@/components/RequireRole";
import StatusBadge from "@/components/StatusBadge";
import { supabase } from "@/lib/supabaseClient";
import { generateRecommendations } from "@/lib/recommendationEngine";

export default function ManagerTasksPage(){
 const [tasks,setTasks]=useState([]); const [recs,setRecs]=useState({}); const [reviews,setReviews]=useState({});
 useEffect(()=>{load();},[]);
 async function load(){ const {data}=await supabase.from("task_requests").select("*, profiles(full_name,email), staff_profiles(staff_name)").order("created_at",{ascending:false}); setTasks(data||[]); }
 async function generate(task){
   const [{data:staff},{data:params}] = await Promise.all([supabase.from("staff_profiles").select("*").eq("is_suspended",false), supabase.from("system_parameters").select("*").eq("id",1).single()]);
   const results=generateRecommendations(staff||[], task, params||{});
   await supabase.from("task_recommendations").delete().eq("task_id", task.id);
   if(results.length) await supabase.from("task_recommendations").insert(results.map(r=>({task_id:task.id,staff_id:r.staff_id,score:r.score,reason:r.reason})));
   setRecs({...recs,[task.id]:results});
 }
 async function viewRecs(task){ const {data}=await supabase.from("task_recommendations").select("*, staff_profiles(*)").eq("task_id",task.id).order("score",{ascending:false}); if(!data?.length) return generate(task); setRecs({...recs,[task.id]:data.map(r=>({staff_id:r.staff_id,staff_name:r.staff_profiles?.staff_name,score:r.score,reason:r.reason}))}); }
 async function approve(task, staffId){
   const {error:updateError}=await supabase.from("task_requests").update({status:"approved", assigned_staff_id:staffId, updated_at:new Date().toISOString()}).eq("id",task.id);
   if(updateError)return alert(updateError.message);
   const {data:staff}=await supabase.from("staff_profiles").select("*").eq("id",staffId).single();
   if(staff){
     await supabase.from("staff_profiles").update({current_workload:Number(staff.current_workload||0)+1, weekly_working_hours:Number(staff.weekly_working_hours||0)+Number(task.estimated_hours||0)}).eq("id",staffId);
     if(staff.user_id){
       const {error:staffNotificationError}=await supabase.from("notifications").insert({user_id:staff.user_id,title:"New task assignment",message:`You have been assigned: ${task.title}`});
       if(staffNotificationError)return alert(staffNotificationError.message);
     }
   }
   if(task.created_by){
     const {error:deptNotificationError}=await supabase.from("notifications").insert({user_id:task.created_by,title:"Task approved",message:`Your task request '${task.title}' was approved and assigned to ${staff?.staff_name || "a staff member"}.`});
     if(deptNotificationError)return alert(deptNotificationError.message);
   }
   await supabase.from("audit_logs").insert({action:"approve_task_request",details:task.title}); load();
 }
 async function reject(task){ const reason=prompt("Reason for rejection?", "Incomplete or not feasible"); await supabase.from("task_requests").update({status:"rejected", rejection_reason:reason}).eq("id",task.id); if(task.created_by) await supabase.from("notifications").insert({user_id:task.created_by,title:"Task rejected",message:`Your task request '${task.title}' was rejected. ${reason||""}`}); await supabase.from("audit_logs").insert({action:"reject_task_request",details:task.title}); load(); }
 async function saveReview(task){ const r=reviews[task.id]||{}; if(!task.assigned_staff_id) return alert("No assigned staff"); const {data:{user}}=await supabase.auth.getUser(); await supabase.from("performance_reviews").insert({task_id:task.id,staff_id:task.assigned_staff_id,manager_id:user?.id,rating:Number(r.rating||5),feedback:r.feedback||""}); await supabase.from("staff_profiles").update({performance_rating:Number(r.rating||5)}).eq("id",task.assigned_staff_id); alert("Performance review saved"); }
 return <RequireRole roles={["manager"]}><Nav role="manager"/><main className="page"><h1>Review Task Requests</h1>{tasks.map(task=><div className="card" key={task.id}><div className="row"><h2 style={{marginRight:"auto"}}>{task.title}</h2><StatusBadge value={task.status}/></div><p>{task.description}</p><p><b>Location:</b> {task.location} | <b>Skill:</b> {task.required_skill} | <b>Priority:</b> {task.priority} | <b>Hours:</b> {task.estimated_hours}</p><p className="small">Requested by: {task.profiles?.full_name || "Unknown"} | Assigned: {task.staff_profiles?.staff_name || "Not assigned"}</p><div className="row"><button className="btn secondary" onClick={()=>viewRecs(task)}>View/Generate Recommendations</button>{task.status==="pending"&&<button className="btn danger" onClick={()=>reject(task)}>Reject</button>}</div>{recs[task.id]&&<div className="card"><h3>Recommended Staff</h3><table><thead><tr><th>Staff</th><th>Score</th><th>Reason</th><th>Action</th></tr></thead><tbody>{recs[task.id].map(r=><tr key={r.staff_id}><td>{r.staff_name}</td><td>{r.score}</td><td>{r.reason}</td><td><button className="btn success" onClick={()=>approve(task,r.staff_id)}>Approve This Staff</button></td></tr>)}</tbody></table></div>}{task.status==="completed"&&<div className="card"><h3>Performance Grading</h3><div className="row"><select className="input" style={{maxWidth:160}} onChange={e=>setReviews({...reviews,[task.id]:{...(reviews[task.id]||{}),rating:e.target.value}})}><option value="5">5 Stars</option><option value="4">4 Stars</option><option value="3">3 Stars</option><option value="2">2 Stars</option><option value="1">1 Star</option></select><input className="input" placeholder="Feedback" onChange={e=>setReviews({...reviews,[task.id]:{...(reviews[task.id]||{}),feedback:e.target.value}})} /><button className="btn" onClick={()=>saveReview(task)}>Save Review</button></div></div>}</div>)}</main></RequireRole>;
}
