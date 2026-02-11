import { NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const challengeCode = url.searchParams.get("challenge_code");

  if (!challengeCode) {
    return NextResponse.json({ error: "Missing challenge_code" }, { status: 400 });
  }

  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
  if (!verificationToken) {
    return NextResponse.json({ error: "Missing EBAY_VERIFICATION_TOKEN" }, { status: 500 });
  }

  // Must be origin + pathname exactly, no query string
  const endpoint = `${url.origin}${url.pathname}`;

  const challengeResponse = crypto
    .createHash("sha256")
    .update(challengeCode + verificationToken + endpoint)
    .digest("hex");

  return NextResponse.json({ challengeResponse }, { status: 200 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("[ebay deletion notification] received:", body);
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (e) {
    console.log("[ebay deletion notification] non-json or empty body");
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
