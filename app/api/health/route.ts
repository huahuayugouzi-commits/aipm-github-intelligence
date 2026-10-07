import { db } from "@/lib/db";
import { settings } from "@/lib/config";
import { getEffectiveAIStatus } from "@/lib/service-status";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){try{const row=db.prepare("SELECT 1 ok").get() as {ok:number};const running=db.prepare("SELECT COUNT(*) n FROM pipeline_runs WHERE status='running'").get() as {n:number};const ai=getEffectiveAIStatus();return Response.json({status:"ok",database:row.ok===1?"ok":"error",mode:settings.dataMode,aiProvider:settings.aiProvider,aiService:{status:ai.status,code:ai.code,message:ai.message,updatedAt:ai.updated_at},schedulerTimezone:settings.timezone,runningJobs:running.n,timestamp:new Date().toISOString()});}catch{return Response.json({status:"error",database:"error",message:"服务健康检查暂时不可用",timestamp:new Date().toISOString()},{status:503});}}
