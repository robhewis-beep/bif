import { NextResponse } from "next/server";

// eBay sends a GET challenge first to verify the endpoint
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const challengeCode = searchParams.get("challenge_code");

  if (!challengeCode) {
    return new NextResponse("Missing challenge_code", { status: 400 });
  }

  // Echo back the challenge code exactly as eBay requires
  return new NextResponse(challengeCode, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// eBay may POST account-deletion events here in the future
export async function POST() {
  // You don't store eBay users, so just acknowledge
  return NextResponse.json({ received: true });
}
