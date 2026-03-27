import { createClient } from "@supabase/supabase-js";

type Listing = {
  platform: "ebay";
  title: string;
  url: string;
  image_url?: string | null;
  price_value?: number | null;
  price_currency?: string | null;
  item_condition?: string | null;
};

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

function cleanEbayTitle(t: string) {
  return t
    .replace(/\s+\|\s*eBay.*$/i, "")
    .replace(/^New Listing\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function legacyIdFromEbayUrl(u: string): string | null {
  const m = u.match(/\/itm\/(\d+)/);
  return m?.[1] ?? null;
}

let ebayTokenCache: { token: string; expiresAt: number } | null = null;

async function getEbayAppToken(): Promise<string> {
  const now = Date.now();
  if (ebayTokenCache && now < ebayTokenCache.expiresAt - 60_000) {
    return ebayTokenCache.token;
  }

  const clientId = getEnv("EBAY_CLIENT_ID");
  const clientSecret = getEnv("EBAY_CLIENT_SECRET");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("scope", "https://api.ebay.com/oauth/api_scope");

  const resp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`eBay token error: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  ebayTokenCache = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };

  return json.access_token;
}

async function ebaySearch(query: string): Promise<Listing[]> {
  const token = await getEbayAppToken();

  const url =
    `https://api.ebay.com/buy/browse/v1/item_summary/search` +
    `?q=${encodeURIComponent(query)}` +
    `&limit=10` +
    `&filter=buyingOptions:{FIXED_PRICE|AUCTION}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`eBay search error: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  const items = data.itemSummaries ?? [];

  return items
    .map((it: any) => {
      const img =
        it.image?.imageUrl ??
        it.thumbnailImages?.[0]?.imageUrl ??
        it.additionalImages?.[0]?.imageUrl ??
        null;

      return {
        platform: "ebay" as const,
        title: cleanEbayTitle((it.title ?? it.itemTitle ?? "eBay listing").toString()),
        url: (it.itemWebUrl ?? "").toString(),
        image_url: img ? String(img) : null,
        price_value: it.price?.value != null ? Number(it.price.value) : null,
        price_currency: it.price?.currency != null ? String(it.price.currency) : null,
        item_condition: it.condition != null ? String(it.condition) : null,
      };
    })
    .filter((x: Listing) => x.url?.includes("/itm/"));
}

async function ebayGetByLegacyId(
  legacyId: string
): Promise<{
  title: string | null;
  image: string | null;
  price_value: number | null;
  price_currency: string | null;
  item_condition: string | null;
}> {
  const token = await getEbayAppToken();

  const url =
    `https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id` +
    `?legacy_item_id=${encodeURIComponent(legacyId)}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    return {
      title: null,
      image: null,
      price_value: null,
      price_currency: null,
      item_condition: null,
    };
  }

  const it = await resp.json();

  return {
    title: it.title ? cleanEbayTitle(String(it.title)) : null,
    image:
      (it.image?.imageUrl as string | undefined) ??
      (it.additionalImages?.[0]?.imageUrl as string | undefined) ??
      null,
    price_value: it.price?.value != null ? Number(it.price.value) : null,
    price_currency: it.price?.currency != null ? String(it.price.currency) : null,
    item_condition: it.condition != null ? String(it.condition) : null,
  };
}

export async function runSearchEngine(userId?: string) {
  const supabase = getSupabaseAdmin();

  let trackedQuery = supabase
    .from("tracked_items")
    .select("id, user_id, brand, item_name, currency, is_paused, is_active")
    .eq("is_active", true)
    .eq("is_paused", false);

  if (userId) {
    trackedQuery = trackedQuery.eq("user_id", userId);
  }

  const { data: tracked, error: trackedError } = await trackedQuery;

  if (trackedError) {
    throw new Error(trackedError.message ?? "Failed to load tracked items");
  }

  if (!tracked || tracked.length === 0) {
    return { searched: 0, upserted: 0, usersToEmail: new Set<string>() };
  }

  let searched = 0;
  let upserted = 0;
  const usersToEmail = new Set<string>();

  for (const item of tracked) {
    searched += 1;

    const searchQuery = `${item.brand} ${item.item_name}`.trim();

    let listings: Listing[] = [];
    try {
      listings = await ebaySearch(searchQuery);
    } catch (err) {
      console.error("[runSearchEngine] ebaySearch failed for", searchQuery, err);
      continue;
    }

    let enriched = 0;
    for (const l of listings) {
      const needsTitle = !l.title || l.title === "eBay listing";
      const needsImage = !l.image_url;
      const needsPrice = l.price_value == null || !l.price_currency;
      const needsCondition = !l.item_condition;

      if (!(needsTitle || needsImage || needsPrice || needsCondition)) continue;

      const legacyId = legacyIdFromEbayUrl(l.url);
      if (!legacyId) continue;

      try {
        const extra = await ebayGetByLegacyId(legacyId);

        if (needsTitle && extra.title) l.title = extra.title;
        if (needsImage && extra.image) l.image_url = extra.image;
        if (needsPrice && extra.price_value != null) l.price_value = extra.price_value;
        if (needsPrice && extra.price_currency) l.price_currency = extra.price_currency;
        if (needsCondition && extra.item_condition) l.item_condition = extra.item_condition;
      } catch (err) {
        console.error("[runSearchEngine] ebayGetByLegacyId failed for", legacyId, err);
      }

      enriched += 1;
      if (enriched >= 3) break;
    }

    if (!listings.length) continue;

    const rows = listings.map((l) => ({
      user_id: item.user_id,
      tracked_item_id: item.id,
      platform: l.platform,
      listing_url: l.url,
      title: l.title,
      image_url: l.image_url ?? null,
      price_value: l.price_value ?? null,
      price_currency: l.price_currency ?? null,
      item_condition: l.item_condition ?? null,
      currency: item.currency ?? "GBP",
      notified: false,
    }));

    const { error: upsertError } = await supabase.from("found_listings").upsert(rows, {
      onConflict: "user_id,platform,listing_url",
    });

    if (upsertError) {
      console.error("[runSearchEngine] upsert failed for", searchQuery, upsertError);
      continue;
    }

    upserted += rows.length;
    usersToEmail.add(item.user_id);

    const urls = rows.map((r) => r.listing_url);

    const { data: insertedOrExisting, error: fetchErr } = await supabase
      .from("found_listings")
      .select("id, listing_url")
      .eq("user_id", item.user_id)
      .eq("platform", "ebay")
      .in("listing_url", urls);

    if (!fetchErr && insertedOrExisting?.length) {
      const matchRows = insertedOrExisting.map((x: any) => ({
        user_id: item.user_id,
        found_listing_id: x.id,
        tracked_item_id: item.id,
      }));

      await supabase
        .from("found_listing_matches")
        .upsert(matchRows, { onConflict: "found_listing_id,tracked_item_id" });
    }
  }

  return { searched, upserted, usersToEmail };
}
