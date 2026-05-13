"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type FoundRow = {
  id: string;
  platform: string;
  title: string;
  listing_url: string;
  image_url: string | null;
  matched_at: string;
  price_value: number | null;
  price_currency: string | null;
  item_condition: string | null;
  tracked_item: null | {
    brand: string | null;
    item_name: string | null;
    size: string | null;
  };
};

type GroupedRow = FoundRow & { isNew: boolean };

export default function FoundPage() {
  const router = useRouter();
  const [rows, setRows] = useState<FoundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastViewed, setLastViewed] = useState("1970-01-01T00:00:00Z");
  const [lastSeen, setLastSeen] = useState(0);
  const [userId, setUserId] = useState("");

  function storageKey(uid: string) {
    return `bif_found_last_seen_${uid}`;
  }

  function markAllAsSeen() {
    if (!userId) return;
    const now = Date.now();
    localStorage.setItem(storageKey(userId), String(now));
    setLastSeen(now);
  }

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      router.push("/login");
      return;
    }

    const uid = session.user.id;
    setUserId(uid);

    await supabase.from("profiles").upsert({ id: uid }, { onConflict: "id" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("last_found_viewed_at")
      .eq("id", uid)
      .single();

    const lv = profile?.last_found_viewed_at ?? "1970-01-01T00:00:00Z";
    setLastViewed(lv);

    const prev = Number(localStorage.getItem(storageKey(uid)) ?? "0");
    setLastSeen(prev);

    const params = new URLSearchParams(window.location.search);
    const trackedItemId = params.get("tracked_item_id");

    let query = supabase
      .from("found_listings")
      .select(`
        id,
        platform,
        title,
        listing_url,
        image_url,
        matched_at,
        price_value,
        price_currency,
        item_condition,
        tracked_item:tracked_items!found_listings_tracked_item_id_fkey (
          brand,
          item_name,
          size
        )
      `)
      .eq("user_id", uid)
      .order("matched_at", { ascending: false })
      .limit(200);

    if (trackedItemId) {
      query = query.eq("tracked_item_id", trackedItemId);
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }

    const mappedRows: FoundRow[] = (data ?? []).map((row: any) => ({
  id: row.id,
  platform: row.platform,
  title: row.title,
  listing_url: row.listing_url,
  image_url: row.image_url ?? null,
  matched_at: row.matched_at,
  price_value: row.price_value ?? null,
  price_currency: row.price_currency ?? null,
  item_condition: row.item_condition ?? null,
  tracked_item: Array.isArray(row.tracked_item)
    ? row.tracked_item[0] ?? null
    : row.tracked_item ?? null,
}));

setRows(mappedRows);
    setLoading(false);

    await supabase
      .from("profiles")
      .update({ last_found_viewed_at: new Date().toISOString() })
      .eq("id", uid);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, GroupedRow[]>();

    for (const r of rows) {
      const ti = r.tracked_item;

      const brand = ti?.brand ?? "Unknown";
      const itemName = ti?.item_name ?? "search item";
      const size = ti?.size ? ` (${ti.size})` : "";

      const key = `${brand} — ${itemName}${size}`;

      const isNew = new Date(r.matched_at).getTime() > lastSeen;
      const rowWithNew: GroupedRow = { ...r, isNew };

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rowWithNew);
    }

    return Array.from(map.entries());
  }, [rows, lastSeen]);

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>Found listings</h1>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={markAllAsSeen}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "transparent",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Mark all as seen
          </button>

          <Link href="/dashboard" style={{ textDecoration: "none", fontWeight: 600 }}>
            Back to dashboard
          </Link>
        </div>
      </header>

      {loading ? (
        <p style={{ marginTop: 16 }}>Loading…</p>
      ) : grouped.length === 0 ? (
        <p style={{ marginTop: 16 }}>No found listings yet. Run a search from the dashboard.</p>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
          {grouped.map(([groupTitle, groupRows]) => (
            <details
              key={groupTitle}
              open
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <summary
                style={{
                  cursor: "pointer",
                  listStyle: "none",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  fontWeight: 800,
                  fontSize: 16,
                  outline: "none",
                }}
              >
                <span>{groupTitle}</span>
                <span style={{ opacity: 0.7, fontWeight: 600 }}>
                  {groupRows.length} found
                </span>
              </summary>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {groupRows.map((r) => {
                  const isNew =
                    new Date(r.matched_at).getTime() > new Date(lastViewed).getTime();

                  const price =
                    r.price_value != null
                      ? `${r.price_currency ?? ""} ${r.price_value}`.trim()
                      : "";

                  const meta = [price, r.item_condition].filter(Boolean).join(" • ");

                  return (
                    <a
                      key={r.id}
                      href={r.listing_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        border: "1px solid #eee",
                        borderRadius: 10,
                        padding: 10,
                        textDecoration: "none",
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      {r.image_url ? (
                        <img
                          src={r.image_url}
                          alt={r.title || "Listing image"}
                          style={{
                            width: 72,
                            height: 72,
                            objectFit: "cover",
                            borderRadius: 8,
                            flex: "0 0 auto",
                          }}
                        />
                      ) : null}

                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontWeight: 700 }}>{r.title}</div>
                          {isNew ? (
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 800,
                                padding: "2px 8px",
                                borderRadius: 999,
                                border: "1px solid rgba(255,255,255,0.25)",
                                background: "rgba(0,0,0,0.35)",
                              }}
                            >
                              NEW
                            </span>
                          ) : null}
                        </div>

                        <div style={{ opacity: 0.8, marginTop: 6 }}>
                          {r.platform} • {new Date(r.matched_at).toLocaleString()}
                        </div>

                        {meta ? (
                          <div style={{ opacity: 0.8, marginTop: 4 }}>{meta}</div>
                        ) : null}
                      </div>
                    </a>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}