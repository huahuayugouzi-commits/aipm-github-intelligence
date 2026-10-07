import { db, nowIso } from "./db";
import { settings } from "./config";

export function setAIStatus(status:"healthy"|"degraded",code:string|null,message:string){
  db.prepare(`INSERT INTO service_status(service,status,code,message,updated_at) VALUES('ai',?,?,?,?)
    ON CONFLICT(service) DO UPDATE SET status=excluded.status,code=excluded.code,message=excluded.message,updated_at=excluded.updated_at`)
    .run(status,code,message,nowIso());
}

export function getAIStatus(){
  return db.prepare("SELECT status,code,message,updated_at FROM service_status WHERE service='ai'").get() as {status:string;code:string|null;message:string;updated_at:string}|undefined;
}

export function getEffectiveAIStatus(){
  if(settings.aiProvider!=="mock"&&!process.env.AI_API_KEY){
    return {status:"degraded",code:"missing_key",message:"AI 分析服务暂时不可用，当前展示最近一次分析结果。",updated_at:nowIso()};
  }
  return getAIStatus()||{status:"healthy",code:null,message:"AI 分析服务正常",updated_at:nowIso()};
}

export function logAIError(runId:number,projectId:number,code:string,message:string,retryable:boolean){
  db.prepare("INSERT INTO ai_error_logs(run_id,project_id,code,message,retryable,created_at) VALUES(?,?,?,?,?,?)")
    .run(runId,projectId,code,message,retryable?1:0,nowIso());
}
