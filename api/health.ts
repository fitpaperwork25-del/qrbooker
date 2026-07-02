import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Real health check for Platform Admin's Health Engine — every field
// below reflects an actual check performed on each request, not a
// static or fabricated value. Same response contract as qrwegn's
// api/health.ts (plus `environment`) so Platform Admin can consume
// both products uniformly.
//
// version mirrors package.json's declared "0.0.1" (no git tags exist
// in this repo) — keep in sync if package.json's version changes.
const VERSION = "0.0.1";
const ENVIRONMENT = process.env.VERCEL_ENV ?? "production";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface CheckResult {
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
}

async function checkDatabase(): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Supabase credentials are not configured.");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { error } = await supabase.from("orders").select("id", { count: "exact", head: true }).limit(1);
    if (error) throw error;
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : "Database check failed." };
  }
}

async function checkAuthentication(): Promise<CheckResult> {
  const startedAt = Date.now();
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Supabase credentials are not configured.");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : "Authentication check failed." };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();

  // The handler executing at all is the API health signal.
  const api: CheckResult = { status: "ok" };
  const [database, authentication] = await Promise.all([checkDatabase(), checkAuthentication()]);

  const healthy = database.status === "ok" && authentication.status === "ok";

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "degraded",
    version: VERSION,
    environment: ENVIRONMENT,
    runtime: { status: "ok", checkDurationMs: Date.now() - startedAt },
    api,
    database,
    authentication,
    timestamp: new Date().toISOString(),
  });
}
