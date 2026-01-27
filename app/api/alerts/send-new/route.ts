import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function getSupabaseAuth() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon);
}

function getSupabaseAdmin() {
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service);
}

function getResend() {
  const key = getEnv("RESEND_API_KEY");
  return new Resend(key);
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    const supabaseAuth = getSupabaseAuth();
    const supabaseAdmin = getSupabaseAdmin();
    const resend = getResend();

    const emailFrom = getEnv("EMAIL_FROM");

    // Validate JWT + get user
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = userData.user;
    const email = user.email;
    if (!email) {
      return NextResponse.json({ error: "User email not available" }, { status: 400 });
    }

    // Fetch unnotified listings for this user
    const { data: listings, error: listErr } = await supabaseAdmin
      .from("found_listings")
      .select("id, platform, title, listing_url, matched_at")
      .eq("user_id", user.id)
      .eq("notified", false)
      .order("matched_at", { ascending: false })
      .limit(20);

    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }

    if (!listings || listings.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const lines = listings
      .map((l) => `• ${l.title}\n${l.listing_url}\n`)
      .join("\n");

    const subject = `BIF: ${listings.length} new match${listings.length === 1 ? "" : "es"}`;

    await resend.emails.send({
      from: emailFrom,
      to: email,
      subject,
      text:
        `New listings found for your tracked items:\n\n` +
        lines +
        `\n\nOpen BIF: /found\n`,
    });

    // Mark as notified
    const ids = listings.map((l) => l.id);
    const { error: updErr } = await supabaseAdmin
      .from("found_listings")
      .update({ notified: true })
      .in("id", ids);

    if (updErr) {
      return NextResponse.json(
        { error: "Email sent, but failed to mark notified: " + updErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, sent: listings.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
