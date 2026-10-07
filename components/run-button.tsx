"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunButton({enabled}:{enabled:boolean}){
  const [running,setRunning]=useState(false); const [message,setMessage]=useState("");const [secret,setSecret]=useState(""); const router=useRouter();
  async function run(){setRunning(true);setMessage("正在采集、分析并生成报告……");try{const r=await fetch("/api/pipeline/run",{method:"POST",headers:{"x-pipeline-secret":secret}});const d=await r.json();if(!r.ok){setMessage(d.message||"任务暂时无法启动。");return}setMessage(`${d.message} 采集 ${d.collected}，分析 ${d.analyzed}，缓存命中 ${d.cacheHits}。`);setSecret("");router.refresh();}catch{setMessage("任务请求失败，请稍后重试。")}finally{setRunning(false)}}
  if(!enabled)return <div className="notice warn">普通访问只读取数据库缓存。管理员手动触发未启用；配置 PIPELINE_SECRET 后可在此运行。</div>;
  return <div className="runbox"><input className="admin-secret" type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)} placeholder="管理员触发密钥" aria-label="管理员触发密钥"/><button className="btn" disabled={running||!secret} onClick={run}>{running?"运行中…":"管理员运行任务"}</button>{message&&<span className="muted">{message}</span>}</div>
}
