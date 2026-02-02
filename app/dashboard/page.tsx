"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type TrackedItem = {
  id: string;
  brand: string;
  item_name: string;
  size: string;
  max_price: number;
  currency: string;
  search_frequency: string;
  is_active: boolean;
  is_paused: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      .select("id, brand, item_name, category, size, search_query, max_price, currency, search_frequency, is_active, is_paused")
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    setItems((data ?? []) as TrackedItem[]);
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // ✅ Runs the search + saves listings + triggers email digest
  async function runSearchAndEmail() {
    // 1) Confirm user is logged in
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const user = session?.user;

    if (!user) {
      alert("Not logged in");
      router.push("/login");
      return;
    }

    // 2) Load active tracked items
    const { data: tracked, error: trackedErr } = await supabase
      .from("tracked_items")
      .select("id, brand, item_name, size, currency")
      .eq("is_active", true);

    if (trackedErr) {
      alert("Error loading tracked items: " + trackedErr.message);
      return;
    }

    if (!tracked || tracked.length === 0) {
      alert("No active tracked items to search.");
      return;
    }

    let totalUpserted = 0;

    // 3) Search eBay for each tracked item and upsert results
    for (const item of tracked) {
      const query = `${item.brand} ${item.item_name} ${item.size}`.trim();

      const res = await fetch("/api/search/ebay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();

      if (data.error) {
        alert(`eBay search error for "${query}": ${data.error}`);
        continue;
      }

      const listings = (data.listings ?? []) as { url: string; title?: string }[];
      if (listings.length === 0) continue;

      const rows = listings.map((l) => ({
        user_id: user.id,
        tracked_item_id: item.id,
        platform: "ebay",
        listing_url: l.url,
        title: l.title ?? "eBay listing",
        currency: item.currency ?? "GBP",
      }));

      const { error: upsertErr } = await supabase.from("found_listings").upsert(rows, {
        onConflict: "user_id,platform,listing_url",
        ignoreDuplicates: true,
      });

      if (upsertErr) {
        alert(`Save error for "${query}": ${upsertErr.message}`);
        continue;
      }

      totalUpserted += rows.length;
    }

    // 4) Trigger server-side email digest for any unnotified listings
    const token = session?.access_token;
    if (token) {
      const resp = await fetch("/api/alerts/send-new", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const out = await resp.json();
      if (out?.error) {
        alert("Email alert error: " + out.error);
      }
    }

    alert(`Done. Upserted about ${totalUpserted} listing rows. (Email digest sent if there were new ones.)`);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>Dashboard</h1>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link
            href="/add"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Add item
          </Link>

          <Link
            href="/found"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#111",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Found listings
          </Link>

          <button
            onClick={logout}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "transparent",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <button onClick={runSearchAndEmail} style={{ marginTop: 12 }}>
        Run search now (and email)
      </button>

      {loading && <p style={{ marginTop: 16 }}>Loading…</p>}
      {error && <p style={{ marginTop: 16, color: "crimson" }}>{error}</p>}

      {!loading && !error && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {items.length === 0 ? (
            <p>No tracked items yet. Click “Add item”.</p>
          ) : (
            items.map((it) => (
  <div key={it.id} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
    <div style={{ fontWeight: 800 }}>
      {it.brand} — {it.item_name}
    </div>

    <div style={{ opacity: 0.8, marginTop: 6 }}>
      Size: {it.size} • Max: {it.currency} {it.max_price} • {it.search_frequency} •{" "}
      {it.is_paused ? "Paused" : "Active"}
    </div>

    {/* ✅ NEW: Saved search controls */}
    <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={async () => {
          await supabase
            .from("tracked_items")
            .update({ is_paused: !it.is_paused })
            .eq("id", it.id);
          await load(); // refresh list
        }}
        style={{ padding: "8px 12px", borderRadius: 10, fontWeight: 800 }}
      >
        {it.is_paused ? "Resume" : "Pause"}
      </button>

      <button
        type="button"
        onClick={async () => {
          const ok = confirm("Delete this search item?");
          if (!ok) return;
          await supabase
            .from("tracked_items")
            .update({ is_active: false })
            .eq("id", it.id);
          await load();
        }}
        style={{ padding: "8px 12px", borderRadius: 10, fontWeight: 800 }}
      >
        Delete
      </button>
    </div>
  </div>
))
          )}
        </div>
      )}
    </main>
  );
}

