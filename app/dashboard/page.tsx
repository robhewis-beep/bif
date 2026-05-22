"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type TrackedItem = {
  id: string;
  brand: string;
  item_name: string;
  category: string;
  size: string;
  max_price: number | null;
  currency: string | null;
  search_frequency: string;
  is_active: boolean;
  is_paused: boolean;
  reference_image_url: string | null;
};

const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #ddd",
  background: "#fff",
  color: "#111",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 14,
  textDecoration: "none",
  display: "inline-block",
};

const btnDark: React.CSSProperties = {
  ...btn,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
};

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      router.push("/login");
      return;
    }

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
        `Done — searched ${out.searched ?? 0} items, found ${out.upserted ?? 0} listings, emailed ${out.emailed ?? 0} users.`
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

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Dashboard</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/add" style={btn}>+ Add item</Link>
          <Link href="/found" style={btnDark}>Found listings</Link>
          <button onClick={logout} style={btn}>Log out</button>
        </div>
      </header>

      {/* Run search button */}
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button
          onClick={runSearchAndEmail}
          disabled={searching}
          style={{
            ...btnDark,
            opacity: searching ? 0.6 : 1,
            padding: "10px 18px",
          }}
        >
          {searching ? "Searching…" : "Run search now"}
        </button>
        {lastResult && (
          <span style={{ fontSize: 13, opacity: 0.7 }}>{lastResult}</span>
        )}
      </div>

      {loading && <p style={{ marginTop: 16 }}>Loading…</p>}
      {error && <p style={{ marginTop: 16, color: "crimson" }}>{error}</p>}

      {!loading && !error && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {items.length === 0 ? (
            <p>No tracked items yet — click "+ Add item" to get started.</p>
          ) : (
            items.map((it) => (
              <div
                key={it.id}
                style={{ border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", gap: 14, alignItems: "flex-start" }}
              >
                {it.reference_image_url && (
                  <img
                    src={it.reference_image_url}
                    alt={`${it.brand} ${it.item_name}`}
                    style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10, border: "1px solid #ddd", flexShrink: 0 }}
                  />
                )}

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>
                    {it.brand} — {it.item_name ?? it.category}
                  </div>

                  <div style={{ opacity: 0.7, marginTop: 4, fontSize: 13 }}>
                    {[
                      it.category,
                      it.size && `Size ${it.size}`,
                      it.max_price && `Up to ${it.currency ?? "GBP"} ${it.max_price}`,
                      it.search_frequency,
                      it.is_paused ? "⏸ Paused" : "▶ Active",
                    ].filter(Boolean).join(" · ")}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={async () => {
                        await supabase
                          .from("tracked_items")
                          .update({ is_paused: !it.is_paused })
                          .eq("id", it.id);
                        await load();
                      }}
                      style={btn}
                    >
                      {it.is_paused ? "Resume" : "Pause"}
                    </button>

                    <Link
                      href={`/found?tracked_item_id=${it.id}`}
                      style={btn}
                    >
                      View found
                    </Link>

                    <button
                      type="button"
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
                      style={{ ...btn, color: "crimson", borderColor: "crimson" }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}