import { connection } from "next/server";

import { withRequestScope } from "@/server/container";

export async function GET() {
  await connection();
  const report = await withRequestScope(({ cradle }) => cradle.healthService.check());
  // Do not leak infrastructure details (hosts, ports) in production.
  const body =
    process.env.NODE_ENV === "production" && !report.database.ok
      ? { status: report.status, database: { ok: false } }
      : report;
  return Response.json(body, { status: report.status === "ok" ? 200 : 503 });
}
