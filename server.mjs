import next from "next";
import cron from "node-cron";
import nextEnv from "@next/env";
import crypto from "node:crypto";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
process.env.INTERNAL_SCHEDULER_SECRET ||= crypto.randomBytes(32).toString("hex");
const dev = process.env.NODE_ENV !== "production" && !process.argv.includes("--production");
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

await app.prepare();

const http = await import("node:http");
http.createServer((req, res) => handle(req, res)).listen(port, () => {
  console.log(`AIPM GitHub Intelligence running at http://localhost:${port}`);
});

const schedule = process.env.CRON_SCHEDULE || "0 9 * * 1";
const snapshotSchedule = process.env.SNAPSHOT_CRON_SCHEDULE || "30 8 * * *";
const timezone = process.env.APP_TIMEZONE || "Asia/Shanghai";
if (cron.validate(schedule)) {
  cron.schedule(schedule, async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/pipeline/run`, {
        method: "POST",
        headers: { "x-aipm-trigger": "scheduler", "x-internal-scheduler-secret": process.env.INTERNAL_SCHEDULER_SECRET },
      });
      console.log(`[scheduler] ${response.status} ${await response.text()}`);
    } catch (error) {
      console.error("[scheduler] pipeline failed", error);
    }
  }, { timezone });
  console.log(`Scheduler active: ${schedule} (${timezone})`);
} else {
  console.error(`Invalid CRON_SCHEDULE: ${schedule}; scheduler disabled.`);
}

if (cron.validate(snapshotSchedule)) {
  cron.schedule(snapshotSchedule, async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/snapshots/run`, {
        method: "POST",
        headers: { "x-aipm-trigger": "snapshot-scheduler", "x-internal-scheduler-secret": process.env.INTERNAL_SCHEDULER_SECRET },
      });
      console.log(`[snapshot-scheduler] ${response.status} ${await response.text()}`);
    } catch (error) {
      console.error("[snapshot-scheduler] snapshot failed", error);
    }
  }, { timezone });
  console.log(`Daily snapshot scheduler active: ${snapshotSchedule} (${timezone})`);
} else {
  console.error(`Invalid SNAPSHOT_CRON_SCHEDULE: ${snapshotSchedule}; daily snapshot scheduler disabled.`);
}
