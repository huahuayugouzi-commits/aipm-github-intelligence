import { db } from "@/lib/db";
import Link from "next/link";
export const dynamic="force-dynamic";

function duration(start:string,end:string|null){if(!end)return "运行中";const ms=new Date(end).getTime()-new Date(start).getTime();return ms<1000?`${ms} ms`:`${(ms/1000).toFixed(1)} s`;}

export default function Runs(){
  const rows=db.prepare("SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 50").all() as any[];
  const counts=db.prepare("SELECT status,COUNT(*) n FROM pipeline_runs GROUP BY status").all() as Array<{status:string;n:number}>;
  const map=Object.fromEntries(counts.map(x=>[x.status,x.n]));
  return <><header className="header"><div><h1>运行记录</h1><div className="subtitle">查看自动任务、手动运行、失败原因和 AI 消耗</div></div><span className="badge">最近 50 次</span></header><section className="grid metrics"><div className="card metric"><small>成功</small><strong>{map.success||0}</strong></div><div className="card metric"><small>部分成功</small><strong>{map.partial||0}</strong></div><div className="card metric"><small>失败</small><strong>{map.failed||0}</strong></div><div className="card metric"><small>运行中</small><strong>{map.running||0}</strong></div></section><section className="section table-wrap"><table><thead><tr><th>ID</th><th>触发方式</th><th>状态</th><th>采集</th><th>分析</th><th>缓存</th><th>耗时</th><th>开始时间</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><Link className="repo" href={`/runs/${row.id}`}>#{row.id}</Link></td><td>{row.trigger_type}</td><td><span className={`badge status-${row.status}`}>{row.status}</span></td><td>{row.collected_count}</td><td>{row.analyzed_count}</td><td>{row.cache_hits}</td><td>{duration(row.started_at,row.finished_at)}</td><td>{row.started_at.slice(0,16).replace("T"," ")}</td></tr>)}</tbody></table></section></>;
}
