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
  matched_at: string;
  tracked_item: null | {
    brand: string;
    item_name: string;
    size: string;
  };
};


type GroupedRow = FoundRow & { isNew: boolean };

export default function FoundPage() {
  const router = useRouter();
  const [rows, setRows] = useState<FoundRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [lastViewed, setLastViewed] = useState<string>("1970-01-01T00:00:00Z");

  const [lastSeen, setLastSeen] = useState<number>(0);
  const [userId, setUserId] = useState<string>("");

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
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
      if (userId) {
    await supabase.from("profiles").upsert({ id: userId }, { onConflict: "id" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("last_found_viewed_at")
      .eq("id", userId)
      .single();

    const lv = profile?.last_found_viewed_at ?? "1970-01-01T00:00:00Z";
    setLastViewed(lv);
  }
    const uid = session.user.id;
    setUserId(uid);

    const prev = Number(localStorage.getItem(storageKey(uid)) ?? "0");
    setLastSeen(prev);

    const { data, error } = await supabase
  .from("found_listings")
  .select(`
    id, platform, title, listing_url, matched_at,
    tracked_item:tracked_items!found_listings_tracked_item_id_fkey ( brand, item_name, size )
  `)
  .order("matched_at", { ascending: false })
  .limit(200);


    if (error) console.error(error);

    const mappedRows = (data ?? []).map((row: any) => ({
      ...row,
      tracked_items: row.tracked_item,
    })) as FoundRow[];

    setRows(mappedRows);
    setLoading(false);
    const { data: userData2 } = await supabase.auth.getUser();
const userId2 = userData2.user?.id;

if (userId2) {
  await supabase
    .from("profiles")
    .update({ last_found_viewed_at: new Date().toISOString() })
    .eq("id", userId2);
}

    // Update last-seen after load
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, GroupedRow[]>();

    for (const r of rows) {
        const ti = r.tracked_item;
const key = ti ? `${ti.brand} — ${ti.item_name} (${ti.size})` : "Unknown search item";


      const isNew = new Date(r.matched_at).getTime() > lastSeen;

      const rowWithNew: GroupedRow = { ...r, isNew };

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rowWithNew);
    }

    return Array.from(map.entries()); // [ [groupTitle, groupRows], ... ]
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
                      display: "block",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <div style={{ fontWeight: 700 }}>{r.title}</div>
  {isNew && (
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
  )}
</div>

                      {r.isNew && (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: 999,
                            border: "1px solid #ddd",
                          }}
                        >
                          New
                        </span>
                      )}
                    </div>

                    <div style={{ opacity: 0.8, marginTop: 6 }}>
                      {r.platform} • {new Date(r.matched_at).toLocaleString()}
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

