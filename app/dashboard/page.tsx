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
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        router.push("/login");
        return;
      }

      const resp = await fetch("/api/search/run-now", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const out = await resp.json();

      if (!resp.ok) {
        alert(`Run-now error: ${out?.error ?? "Unknown error"}`);
        return;
      }

      await load();

      alert(
        `Done. Searched ${out.searched ?? 0} items, upserted ${out.upserted ?? 0} listings, emailed ${out.emailed ?? 0} users.`
      );
    } catch (err: any) {
      alert(err?.message ?? "Something went wrong running the search.");
    }
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
              <div
                key={it.id}
                style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}
              >
                {it.reference_image_url ? (
                  <img
                    src={it.reference_image_url}
                    alt={`${it.brand} ${it.item_name}`}
                    style={{
                      width: 72,
                      height: 72,
                      objectFit: "cover",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      marginBottom: 10,
                    }}
                  />
                ) : null}

                <div style={{ fontWeight: 800 }}>
                  {it.brand} — {it.item_name}
                </div>

                <div style={{ opacity: 0.8, marginTop: 6 }}>
                  Size: {it.size} • Max: {it.currency ?? "GBP"} {it.max_price ?? "—"} •{" "}
                  {it.search_frequency} • {it.is_paused ? "Paused" : "Active"}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase
                        .from("tracked_items")
                        .update({ is_paused: !it.is_paused })
                        .eq("id", it.id);
                      await load();
                    }}
                    style={{ padding: "8px 12px", borderRadius: 10, fontWeight: 800 }}
                  >
                    {it.is_paused ? "Resume" : "Pause"}
                  </button>

                  <Link
                    href={`/found?tracked_item_id=${it.id}`}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      fontWeight: 800,
                      textDecoration: "none",
                      border: "1px solid #ddd",
                      color: "inherit",
                    }}
                  >
                    View found
                  </Link>

                  <Link
                    href={`/found?tracked_item_id=${it.id}`}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      fontWeight: 800,
                      textDecoration: "none",
                      border: "1px solid #ddd",
                      color: "inherit",
                    }}
                  >
                    View new
                  </Link>

                  <button
                    type="button"
                    onClick={async () => {
                      const ok = confirm("Delete this search item?");
                      if (!ok) return;

                      const { error } = await supabase
                        .from("tracked_items")
                        .update({ is_active: false })
                        .eq("id", it.id);

                      if (error) {
                        alert(error.message);
                        return;
                      }

                      setItems((prev) => prev.filter((x) => x.id !== it.id));
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
