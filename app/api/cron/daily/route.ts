console.log("CRON SECRET LOADED:", process.env.CRON_SECRET);
console.log("SUPABASE SERVICE KEY LOADED:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

type Listing = {
  platform: "ebay";
  title: string;
  url: string;
  image_url?: string | null;
};

function extractListingsFromHtml(html: string): Listing[] {
  const out: Listing[] = [];

  // listing urls
  const abs = Array.from(
    new Set(html.match(/https:\/\/www\.ebay\.co\.uk\/itm\/[^\s"'<>]+/g) ?? [])
  );

  const rel = Array.from(new Set(html.match(/\/itm\/[^\s"'<>]+/g) ?? [])).map(
    (p) => `https://www.ebay.co.uk${p}`
  );

  const urls = Array.from(new Set([...abs, ...rel])).slice(0, 12);

  // thumbnail urls (best-effort)
  const m1 = html.match(/https:\/\/i\.ebayimg\.com\/images\/[^\s"'<>]+/g) ?? [];
  const m2 = html.match(/\/\/i\.ebayimg\.com\/images\/[^\s"'<>]+/g) ?? [];
  const m3 = html.match(/https:\/\/thumbs\.ebaystatic\.com\/[^\s"'<>]+/g) ?? [];

  const imgsRaw = Array.from(new Set<string>([...m1, ...m2, ...m3])).map((u) =>
    u.startsWith("//") ? `https:${u}` : u
  );

  const imgs = imgsRaw;

  for (let i = 0; i < urls.length; i++) {
    out.push({
      platform: "ebay",
      title: "eBay listing",
      url: urls[i],
      image_url: imgs[i] ?? null,
    });
  }

  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  try {
    const CRON_SECRET = getEnv("CRON_SECRET");
    const secret = req.headers.get("x-cron-secret") || "";

    if (secret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: tracked, error } = await supabaseAdmin
      .from("tracked_items")
      .select("id, user_id, brand, item_name, currency")
      .eq("is_active", true);

    const msg = (error as { message?: string } | null)?.message ?? "Error loading tracked items";
    if (error) {
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    if (!tracked || tracked.length === 0) {
      return NextResponse.json({ ok: true, searched: 0, upserted: 0 });
    }

    let searched = 0;
    let upserted = 0;

    for (const item of tracked) {
      searched += 1;

      // Use brand + item name for better hit rate (size often reduces results)
      const query = `${item.brand} ${item.item_name}`.trim();
      const searchUrl = `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(query)}`;

      const resp = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        },
        cache: "no-store",
      });

      if (resp.ok) {
        const html = await resp.text();const imgHits =
  (html.match(/https:\/\/i\.ebayimg\.com\/images\/[^\s"'<>]+/g) ?? []).length +
  (html.match(/\/\/i\.ebayimg\.com\/images\/[^\s"'<>]+/g) ?? []).length +
  (html.match(/https:\/\/thumbs\.ebaystatic\.com\/[^\s"'<>]+/g) ?? []).length;

console.log("[cron] ebay html length:", html.length, "imgHits:", imgHits);
console.log("[cron] ebay bot-check?", /robot|captcha|verify/i.test(html));
        const listings = extractListingsFromHtml(html);

        if (listings.length) {
          const rows = listings.map((l) => ({
            user_id: item.user_id,
            tracked_item_id: item.id,
            platform: l.platform,
            listing_url: l.url,
            title: l.title,
            image_url: l.image_url ?? null,
            currency: item.currency ?? "GBP",
            notified: false,
          }));

          const { error: upsertErr, data: upsertData } = await supabaseAdmin.from("found_listings").upsert(rows, {
            onConflict: "user_id,platform,listing_url",
          });

          if (!upsertErr) {
            upserted += rows.length; // count how many we attempted
          }
        }

        // Delay to reduce rate limiting
        await sleep(200);
      }
    }

    return NextResponse.json({ ok: true, searched, upserted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
