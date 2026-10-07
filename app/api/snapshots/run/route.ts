import { captureDailySnapshots } from "@/lib/snapshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const scheduler = request.headers.get("x-aipm-trigger") === "snapshot-scheduler";
  if (scheduler) {
    if (!process.env.INTERNAL_SCHEDULER_SECRET || request.headers.get("x-internal-scheduler-secret") !== process.env.INTERNAL_SCHEDULER_SECRET) {
      return Response.json({ message: "未授权的快照任务请求。" }, { status: 401 });
    }
  } else {
    if (!process.env.PIPELINE_SECRET || request.headers.get("x-pipeline-secret") !== process.env.PIPELINE_SECRET) {
      return Response.json({ message: "仅管理员可以触发快照任务。" }, { status: 401 });
    }
  }
  const result = await captureDailySnapshots();
  return Response.json(result, { status: result.status === "partial" ? 207 : 200 });
}
