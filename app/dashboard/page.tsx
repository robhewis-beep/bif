"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type TrackedItem = {
  id: string;
  brand: string | null;
  item_name: string | null;
  category: string | null;
  size: string | null;
  max_price: number | null;
  currency: string | null;
  search_frequency: string;
  is_active: boolean;
  is_paused: boolean;
  reference_image_url: string | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.push("/login");
      return;
    }

    setUserEmail(sessionData.session.user.email ?? null);

    const { data, error } = await supabase
      .from("tracked_items")
      .select(
        "id, brand, item_name, category, size, search_query, max_price, currency, search_frequency, is_active, is_paused, reference_image_url"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    setItems((data ?? []) as TrackedItem[]);
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function runSearchAndEmail() {
    setSearching(true);
    setLastResult(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { router.push("/login"); return; }

      const resp = await fetch("/api/search/run-now", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const out = await resp.json();

      if (!resp.ok) {
        setLastResult(`Error: ${out?.error ?? "Unknown error"}`);
        return;
      }

      await load();
      setLastResult(
        `Searched ${out.searched ?? 0} items · ${out.upserted ?? 0} listings found · ${out.emailed ?? 0} emails sent`
      );
    } catch (err: any) {
      setLastResult(err?.message ?? "Something went wrong.");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = userEmail?.split("@")[0] ?? "there";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bif-bg)", fontFamily: "var(--bif-font-sans)" }}>

      {/* Nav */}
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
        <div className="bif-logo">
          beloved<span>.</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/add" className="bif-btn">
            + Add item
          </Link>
          <Link href="/found" className="bif-btn bif-btn-dark">
            Found listings
          </Link>
          <button onClick={logout} className="bif-btn">
            Log out
          </button>
        </div>
      </nav>

      {/* Hero band */}
      <div style={{
        padding: "28px 28px 24px",
        background: "var(--bif-bg)",
        borderBottom: "1px solid var(--bif-border)",
      }}>
        <div className="bif-eyebrow" style={{ marginBottom: 6 }}>Your searches</div>
        <h1 style={{
          fontFamily: "var(--bif-font-serif)",
          fontSize: 26,
          fontWeight: 400,
          color: "var(--bif-text)",
          margin: "0 0 4px",
        }}>
          Welcome back, {firstName}.
        </h1>
        <p style={{ fontSize: 13, color: "var(--bif-mauve)", margin: "0 0 20px" }}>
          {loading ? "Loading your items…" : `${items.length} item${items.length === 1 ? "" : "s"} being tracked`}
        </p>

        {/* Run search row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={runSearchAndEmail}
            disabled={searching}
            className="bif-btn bif-btn-dark"
            style={{ padding: "10px 20px", opacity: searching ? 0.6 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {searching ? "Searching…" : "Run search now"}
          </button>

          {lastResult && (
            <span style={{
              fontSize: 12,
              color: "var(--bif-mauve)",
              padding: "6px 14px",
              background: "var(--bif-bg)",
              borderRadius: 20,
              border: "1px solid var(--bif-border)",
            }}>
              {lastResult}
            </span>
          )}
        </div>
      </div>

      {/* Sunset rule */}
      <div className="bif-sunset-rule" style={{ margin: "0 28px" }} />

      {/* Items section */}
      <div style={{ padding: "0 28px 40px" }}>

        <div style={{
          fontSize: 11,
          letterSpacing: "1.2px",
          textTransform: "uppercase",
          color: "var(--bif-mauve)",
          padding: "20px 0 12px",
          fontWeight: 500,
        }}>
          Tracked items
        </div>

        {loading && (
          <p style={{ color: "var(--bif-mauve)", fontSize: 14 }}>Loading…</p>
        )}

        {error && (
          <p style={{ color: "crimson", fontSize: 14 }}>{error}</p>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "48px 24px",
            background: "var(--bif-bg)",
            borderRadius: "var(--bif-radius-lg)",
            border: "1px solid var(--bif-border)",
          }}>
            <div style={{
              fontFamily: "var(--bif-font-serif)",
              fontSize: 20,
              color: "var(--bif-text)",
              marginBottom: 8,
            }}>
              Nothing tracked yet
            </div>
            <p style={{ fontSize: 13, color: "var(--bif-mauve)", marginBottom: 20 }}>
              Add your first beloved item and we'll search for it every day.
            </p>
            <Link href="/add" className="bif-btn bif-btn-dark">
              + Add your first item
            </Link>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((it) => (
              <div
                key={it.id}
                style={{
                  background: "var(--bif-bg)",
                  border: "1px solid var(--bif-border)",
                  borderLeft: `3px solid ${it.is_paused ? "var(--bif-border)" : "var(--bif-amber)"}`,
                  borderRadius: "var(--bif-radius-lg)",
                  padding: "14px 16px",
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  position: "relative",
                }}
              >
                {/* Thumbnail */}
                {it.reference_image_url ? (
                  <img
                    src={it.reference_image_url}
                    alt={`${it.brand ?? ""} ${it.item_name ?? ""}`}
                    style={{
                      width: 64,
                      height: 64,
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1px solid var(--bif-border)",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: 10,
                    border: "1px solid var(--bif-border)",
                    background: "var(--bif-bg)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                  }}>
                    🧥
                  </div>
                )}

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 10,
                    letterSpacing: "1.2px",
                    textTransform: "uppercase",
                    color: "var(--bif-amber)",
                    fontWeight: 500,
                    marginBottom: 2,
                  }}>
                    {it.brand ?? "No brand"}
                  </div>

                  <div style={{
                    fontFamily: "var(--bif-font-serif)",
                    fontSize: 15,
                    color: "var(--bif-text)",
                    marginBottom: 5,
                  }}>
                    {it.item_name ?? it.category ?? "Tracked item"}
                  </div>

                  <div style={{
                    fontSize: 12,
                    color: "var(--bif-mauve)",
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginBottom: 10,
                  }}>
                    {it.category && <span>{it.category}</span>}
                    {it.size && <><span style={{ opacity: 0.4 }}>·</span><span>Size {it.size}</span></>}
                    {it.max_price && <><span style={{ opacity: 0.4 }}>·</span><span>Up to £{it.max_price}</span></>}
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: it.is_paused ? "var(--bif-bg)" : "#EAF3DE",
                      color: it.is_paused ? "var(--bif-mauve)" : "#3B6D11",
                    }}>
                      {it.is_paused ? "Paused" : "Active"}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Link
                      href={`/found?tracked_item_id=${it.id}`}
                      className="bif-btn"
                      style={{ fontSize: 12, padding: "5px 11px" }}
                    >
                      View found
                    </Link>

                    <button
                      type="button"
                      className="bif-btn"
                      style={{ fontSize: 12, padding: "5px 11px" }}
                      onClick={async () => {
                        await supabase
                          .from("tracked_items")
                          .update({ is_paused: !it.is_paused })
                          .eq("id", it.id);
                        await load();
                      }}
                    >
                      {it.is_paused ? "Resume" : "Pause"}
                    </button>

                    <button
                      type="button"
                      className="bif-btn bif-btn-danger"
                      style={{ fontSize: 12, padding: "5px 11px" }}
                      onClick={async () => {
                        const ok = confirm("Delete this tracked item?");
                        if (!ok) return;
                        const { error } = await supabase
                          .from("tracked_items")
                          .update({ is_active: false })
                          .eq("id", it.id);
                        if (error) { alert(error.message); return; }
                        setItems((prev) => prev.filter((x) => x.id !== it.id));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}