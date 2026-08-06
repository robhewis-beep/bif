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
    deleted_at: string | null;
  };
};

type GroupedRow = FoundRow & { isNew: boolean };

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;

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
    if (!session) { router.push("/login"); return; }

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
          size,
          deleted_at
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

    const mappedRows: FoundRow[] = (data ?? [])
      .map((row: any) => ({
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
      }))
      .filter((row: FoundRow) => {
        const deletedAt = row.tracked_item?.deleted_at;
        if (!deletedAt) return true;
        return new Date(deletedAt).getTime() > Date.now() - FOUR_WEEKS_MS;
      });

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

  const { activeGrouped, pastGrouped } = useMemo(() => {
    const activeMap = new Map<string, GroupedRow[]>();
    const pastMap = new Map<string, GroupedRow[]>();

    for (const r of rows) {
      const ti = r.tracked_item;
      const brand = ti?.brand ?? "Unknown";
      const itemName = ti?.item_name ?? "search item";
      const size = ti?.size ? ` (${ti.size})` : "";
      const key = `${brand} — ${itemName}${size}`;
      const isNew = new Date(r.matched_at).getTime() > lastSeen;
      const rowWithNew: GroupedRow = { ...r, isNew };
      const isDeleted = !!ti?.deleted_at;

      if (isDeleted) {
        if (!pastMap.has(key)) pastMap.set(key, []);
        pastMap.get(key)!.push(rowWithNew);
      } else {
        if (!activeMap.has(key)) activeMap.set(key, []);
        activeMap.get(key)!.push(rowWithNew);
      }
    }

    return {
      activeGrouped: Array.from(activeMap.entries()),
      pastGrouped: Array.from(pastMap.entries()),
    };
  }, [rows, lastSeen]);

  function renderListingCard(r: GroupedRow) {
    const isNew = new Date(r.matched_at).getTime() > new Date(lastViewed).getTime();
    const price = r.price_value != null
      ? `${r.price_currency ?? "£"} ${r.price_value}`.trim()
      : "";
    const meta = [price, r.item_condition].filter(Boolean).join(" · ");

    return (
      <a
        key={r.id}
        href={r.listing_url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "12px 14px",
          background: "var(--bif-bg)",
          border: "1px solid var(--bif-border)",
          borderRadius: "var(--bif-radius-md)",
          textDecoration: "none",
        }}
      >
        {r.image_url ? (
          <img
            src={r.image_url}
            alt={r.title || "Listing image"}
            style={{
              width: 64,
              height: 64,
              objectFit: "cover",
              borderRadius: 8,
              flexShrink: 0,
              border: "1px solid var(--bif-border)",
            }}
          />
        ) : (
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 8,
            flexShrink: 0,
            background: "var(--bif-card)",
            border: "1px solid var(--bif-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
          }}>
            🧥
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{
              fontFamily: "var(--bif-font-serif)",
              fontSize: 14,
              color: "var(--bif-text)",
            }}>
              {r.title}
            </div>
            {isNew && (
              <span style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: 20,
                background: "var(--bif-amber)",
                color: "#fff",
                flexShrink: 0,
              }}>
                NEW
              </span>
            )}
          </div>
          <div style={{
            fontSize: 12,
            color: "var(--bif-mauve)",
            marginTop: 4,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}>
            <span style={{ textTransform: "capitalize" }}>
              {r.platform === "vinted_google" ? "Vinted" :
               r.platform === "depop_google" ? "Depop" :
               r.platform}
            </span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>{new Date(r.matched_at).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
            })}</span>
            {meta && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{meta}</span>
              </>
            )}
          </div>
        </div>

        <div style={{
          fontSize: 12,
          color: "var(--bif-amber)",
          flexShrink: 0,
          fontWeight: 500,
        }}>
          View →
        </div>
      </a>
    );
  }

  function renderGroup(
    groupTitle: string,
    groupRows: GroupedRow[],
    isPast: boolean
  ) {
    const newCount = groupRows.filter((r) =>
      new Date(r.matched_at).getTime() > new Date(lastViewed).getTime()
    ).length;

    const ti = groupRows[0]?.tracked_item;
    const representativeImage = groupRows.find((r) => r.image_url)?.image_url ?? null;

    return (
      <details
        key={groupTitle}
        open={false}
        style={{
          background: "var(--bif-card)",
          border: "1px solid var(--bif-border)",
          borderLeft: `3px solid ${isPast ? "var(--bif-border)" : "var(--bif-amber)"}`,
          borderRadius: "var(--bif-radius-lg)",
          opacity: isPast ? 0.75 : 1,
          overflow: "hidden",
        }}
      >
        <summary style={{
          cursor: "pointer",
          listStyle: "none",
          outline: "none",
          padding: "14px 16px",
          display: "flex",
          gap: 14,
          alignItems: "center",
        }}>
          {/* Thumbnail */}
          {representativeImage ? (
            <img
              src={representativeImage}
              alt={groupTitle}
              style={{
                width: 56,
                height: 56,
                objectFit: "cover",
                borderRadius: 8,
                border: "1px solid var(--bif-border)",
                flexShrink: 0,
              }}
            />
          ) : (
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 8,
              border: "1px solid var(--bif-border)",
              background: "var(--bif-bg)",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}>
              🧥
            </div>
          )}

          {/* Item info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {isPast && (
              <div style={{
                fontSize: 10,
                letterSpacing: "1px",
                textTransform: "uppercase",
                color: "var(--bif-mauve)",
                marginBottom: 2,
                fontWeight: 500,
              }}>
                Past search
              </div>
            )}
            <div style={{
              fontSize: 10,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "var(--bif-amber)",
              fontWeight: 500,
              marginBottom: 2,
            }}>
              {ti?.brand ?? "Unknown"}
            </div>
            <div style={{
              fontFamily: "var(--bif-font-serif)",
              fontSize: 15,
              color: "var(--bif-text)",
              marginBottom: 4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {ti?.item_name ?? "Search item"}
            </div>
            <div style={{
              fontSize: 12,
              color: "var(--bif-mauve)",
              display: "flex",
              gap: 6,
              alignItems: "center",
              flexWrap: "wrap",
            }}>
              {ti?.size && <span>Size {ti.size}</span>}
              {ti?.size && <span style={{ opacity: 0.4 }}>·</span>}
              <span>{groupRows.length} listing{groupRows.length === 1 ? "" : "s"}</span>
              {newCount > 0 && !isPast && (
                <>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 20,
                    background: "var(--bif-amber)",
                    color: "#fff",
                  }}>
                    {newCount} new
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Chevron */}
          <div style={{
            fontSize: 12,
            color: "var(--bif-mauve)",
            flexShrink: 0,
          }}>
            ▼
          </div>
        </summary>

        {/* Expanded listings */}
        <div style={{
          borderTop: "1px solid var(--bif-border)",
          padding: "12px 16px",
          display: "grid",
          gap: 8,
        }}>
          {groupRows.map((r) => renderListingCard(r))}
        </div>

        {isPast && (
          <div style={{
            margin: "0 16px 12px",
            fontSize: 12,
            color: "var(--bif-mauve)",
            padding: "8px 12px",
            background: "var(--bif-bg)",
            borderRadius: "var(--bif-radius-md)",
            border: "1px solid var(--bif-border)",
          }}>
            This search was deleted. Listings will be removed automatically after 4 weeks.
          </div>
        )}
      </details>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bif-bg)",
      fontFamily: "var(--bif-font-sans)",
    }}>
      <nav style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 28px",
        background: "var(--bif-bg)",
        borderBottom: "1px solid var(--bif-border)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <Link href="/dashboard" className="bif-logo" style={{ textDecoration: "none" }}>
          beloved<span>.</span>
        </Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/dashboard" className="bif-btn" style={{ fontSize: 13 }}>
            ← Dashboard
          </Link>
        </div>
      </nav>

      {/* Hero band */}
      <div style={{
        padding: "28px 28px 24px",
        background: "var(--bif-bg)",
        borderBottom: "1px solid var(--bif-border)",
      }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div className="bif-eyebrow" style={{ marginBottom: 8 }}>Results</div>
          <h1 style={{
            fontFamily: "var(--bif-font-serif)",
            fontSize: 26,
            fontWeight: 400,
            color: "var(--bif-text)",
            margin: "0 0 4px",
          }}>
            Found listings
          </h1>
          <p style={{ fontSize: 13, color: "var(--bif-mauve)", margin: "0 0 16px" }}>
            {loading ? "Loading…" : `${rows.length} listing${rows.length === 1 ? "" : "s"} across ${activeGrouped.length + pastGrouped.length} search${activeGrouped.length + pastGrouped.length === 1 ? "" : "es"}`}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={markAllAsSeen} className="bif-btn" style={{ fontSize: 13 }}>
              Mark all as seen
            </button>
          </div>
        </div>
      </div>

      <div className="bif-sunset-rule" />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 24px 60px" }}>

        {loading && (
          <p style={{ color: "var(--bif-mauve)", fontSize: 14 }}>Loading…</p>
        )}

        {!loading && activeGrouped.length === 0 && pastGrouped.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "48px 24px",
            background: "var(--bif-card)",
            borderRadius: "var(--bif-radius-lg)",
            border: "1px solid var(--bif-border)",
          }}>
            <div style={{
              fontFamily: "var(--bif-font-serif)",
              fontSize: 20,
              color: "var(--bif-text)",
              marginBottom: 8,
            }}>
              Nothing found yet
            </div>
            <p style={{ fontSize: 13, color: "var(--bif-mauve)", marginBottom: 20 }}>
              Run a search from the dashboard to start finding your beloved items.
            </p>
            <Link href="/dashboard" className="bif-btn bif-btn-dark">
              ← Go to dashboard
            </Link>
          </div>
        )}

        {!loading && activeGrouped.length > 0 && (
          <div style={{ display: "grid", gap: 12, marginBottom: pastGrouped.length > 0 ? 32 : 0 }}>
            {activeGrouped.map(([title, groupRows]: [string, GroupedRow[]]) =>
              renderGroup(title, groupRows, false)
            )}
          </div>
        )}

        {!loading && pastGrouped.length > 0 && (
          <>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "8px 0 16px",
            }}>
              <div style={{
                fontSize: 11,
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                color: "var(--bif-mauve)",
                fontWeight: 500,
              }}>
                Past searches
              </div>
              <div style={{ flex: 1, height: "0.5px", background: "var(--bif-border)" }} />
              <div style={{ fontSize: 12, color: "var(--bif-mauve)" }}>
                Removed within 4 weeks
              </div>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {pastGrouped.map(([title, groupRows]: [string, GroupedRow[]]) =>
                renderGroup(title, groupRows, true)
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
