import { runPipeline } from "@/lib/pipeline";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request){
  const scheduler=request.headers.get("x-aipm-trigger")==="scheduler";
  if(scheduler){if(!process.env.INTERNAL_SCHEDULER_SECRET||request.headers.get("x-internal-scheduler-secret")!==process.env.INTERNAL_SCHEDULER_SECRET)return Response.json({message:"未授权的定时任务请求。"},{status:401});}
  else{if(!process.env.PIPELINE_SECRET)return Response.json({message:"管理员手动触发尚未配置，请设置 PIPELINE_SECRET。"},{status:503});if(request.headers.get("x-pipeline-secret")!==process.env.PIPELINE_SECRET)return Response.json({message:"管理员触发密钥无效。"},{status:401});}
  const result=await runPipeline(scheduler?"scheduler":"manual");return Response.json(result,{status:result.status==="failed"?500:200});
}
