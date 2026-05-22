import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runSearchEngine } from "@/lib/runSearchEngine";
import { sendNewListingsEmail } from "@/lib/sendNewListingsEmail";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getSupabaseAdmin() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey);
}

export async function POST(req: Request) {
  try {
    const CRON_SECRET = getEnv("CRON_SECRET");
    const secret = req.headers.get("x-cron-secret") || "";
    
    console.log(`[cron] secret present: ${!!secret}, match: ${secret === CRON_SECRET}`);
    
    if (secret !== CRON_SECRET) {
      console.error("[cron] Unauthorized — secret mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    console.log("[cron] Authorized — starting search + email run");

    const supabaseAdmin = getSupabaseAdmin();

    const { searched, upserted, usersToEmail } = await runSearchEngine();

    const resendKey = getEnv("RESEND_API_KEY");
    const emailFrom = getEnv("EMAIL_FROM");
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    let emailed = 0;
    const MAX_USERS_TO_EMAIL_PER_RUN = 25;
    let emailedAttempts = 0;

    for (const userId of usersToEmail) {
      if (emailedAttempts >= MAX_USERS_TO_EMAIL_PER_RUN) break;
      emailedAttempts += 1;

      const res = await sendNewListingsEmail({
        supabaseAdmin,
        userId,
        emailFrom,
        resendKey,
        appBaseUrl,
      });

      if (res.sent) emailed += 1;
    }

    return NextResponse.json({ ok: true, searched, upserted, emailed });
  } catch (err: any) {
    console.error("[cron] top-level error:", err);
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 });
  }
}