import { NextResponse } from "next/server";

type Listing = {
  platform: "ebay";
  title: string;
  url: string;
  priceText?: string;
};

function extractListingsFromHtml(html: string): Listing[] {
  // MVP parser: look for common eBay search result links
  // NOTE: This is intentionally basic. We'll improve matching later.
  const listings: Listing[] = [];

  // This regex finds result links that look like: https://www.ebay.co.uk/itm/1234567890...
  const urlRegex = /https:\/\/www\.ebay\.co\.uk\/itm\/[^\s"'<>]+/g;
  const urls = Array.from(new Set(html.match(urlRegex) ?? [])).slice(0, 10);

  for (const url of urls) {
    listings.push({
      platform: "ebay",
      title: "eBay listing",
      url,
    });
  }

  return listings;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query } = body as { query: string };

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const searchUrl = `https://www.ebay.co.uk/sch/i.html?_nkw=${encodeURIComponent(query)}`;

    const resp = await fetch(searchUrl, {
      headers: {
        // Pretend to be a browser (often helps)
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      // Avoid Next caching during dev
      cache: "no-store",
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `eBay request failed (${resp.status})` },
        { status: 502 }
      );
    }

    const html = await resp.text();
    const listings = extractListingsFromHtml(html);

    return NextResponse.json({
      ebayUrl: searchUrl,
      count: listings.length,
      listings,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
