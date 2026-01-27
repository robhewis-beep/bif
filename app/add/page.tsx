"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function AddPage() {
  const router = useRouter();

  const [brand, setBrand] = useState("");
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("jacket");
  const [size, setSize] = useState("");
  const [maxPrice, setMaxPrice] = useState<number>(100);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      const { error } = await supabase.from("tracked_items").insert({
        user_id: user.id,
        brand,
        item_name: itemName,
        category,
        size,
        max_price: maxPrice,
        currency: "GBP",
        search_frequency: "daily",
        is_active: true,
      });

      if (error) throw error;

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>Add item</h1>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <input
          style={{ padding: 10 }}
          placeholder="Brand"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          required
        />
        <input
          style={{ padding: 10 }}
          placeholder="Item name / keywords"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          required
        />
        <input
          style={{ padding: 10 }}
          placeholder="Category (e.g., jacket)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
        />
        <input
          style={{ padding: 10 }}
          placeholder="Size (e.g., M, 32, UK 9)"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          required
        />
        <input
          style={{ padding: 10 }}
          type="number"
          min={1}
          step="1"
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          required
        />

        {error && <div style={{ color: "crimson" }}>{error}</div>}

        <button style={{ padding: 10, fontWeight: 800 }} disabled={loading}>
          {loading ? "Saving..." : "Save tracked item"}
        </button>
      </form>
    </main>
  );
}
