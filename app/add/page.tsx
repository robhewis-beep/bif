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
  const [maxPrice, setMaxPrice] = useState<number | "">(100);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFrequency, setSearchFrequency] = useState<"daily" | "weekly">("daily");
  const [isPaused, setIsPaused] = useState(false);
  const [imageOnlySearch, setImageOnlySearch] = useState(false);
  const [suggestionStatus, setSuggestionStatus] = useState<string | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  const [suggesting, setSuggesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buttonStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    fontWeight: 800,
    cursor: "pointer",
    transition: "all 0.15s ease",
  };

  async function uploadReferenceImage(userId: string) {
    if (!imageFile) return null;
    if (uploadedImageUrl) return uploadedImageUrl;

    const ext = imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${userId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("tracked-item-images")
      .upload(filePath, imageFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);

    const { data } = supabase.storage.from("tracked-item-images").getPublicUrl(filePath);

    setUploadedImageUrl(data.publicUrl);
    return data.publicUrl;
  }

  async function suggestFromImage() {
    if (!imageFile) {
      setError("Please choose an image first.");
      return;
    }

    setSuggesting(true);
    setError(null);
    setSuggestionStatus(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      const imageUrl = await uploadReferenceImage(user.id);
      if (!imageUrl) throw new Error("Could not upload image for analysis.");

      const resp = await fetch("/api/image/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });

      const text = await resp.text();

      let out: any;
      try {
        out = JSON.parse(text);
      } catch {
        throw new Error(`Image suggest route returned non-JSON: ${text.slice(0, 120)}`);
      }

      if (!resp.ok) throw new Error(out?.error ?? "Image suggestion failed");

      const s = out?.suggestion;
      if (!s) throw new Error("No suggestion returned");

      if (s.brand) setBrand(s.brand);
      if (s.itemName) setItemName(s.itemName);
      if (s.category) setCategory(s.category);
      if (s.sizeHint && !size) setSize(s.sizeHint);
      if (s.searchQuery) setSearchQuery(s.searchQuery);
      const filledCount = [
  s.brand,
  s.itemName,
  s.category,
  s.sizeHint,
  s.searchQuery,
].filter(Boolean).length;

setSuggestionStatus(
  filledCount > 0
    ? "Suggestions added from image. Please check and edit before saving."
    : "No strong suggestions found from this image."
);
    } catch (err: any) {
      setSuggestionStatus(null);
      setError(err?.message ?? "Could not suggest from image");
    } finally {
      setSuggesting(false);
    }
  }

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

      const referenceImageUrl = await uploadReferenceImage(user.id);

      const hasAnyText =
        brand.trim() ||
        itemName.trim() ||
        category.trim() ||
        size.trim() ||
        searchQuery.trim();

      if (!hasAnyText && !referenceImageUrl) {
        throw new Error("Please provide either some search details or a reference image.");
      }

      if (imageOnlySearch && !referenceImageUrl) {
        throw new Error("Image only search requires a reference image.");
      }

      const { error } = await supabase.from("tracked_items").insert({
        user_id: user.id,
        brand: brand.trim() || null,
        item_name: itemName.trim() || null,
        category: category.trim() || null,
        size: size.trim() || null,
        search_query: searchQuery.trim() || null,
        max_price: maxPrice === "" ? null : Number(maxPrice),
        search_frequency: searchFrequency,
        is_paused: isPaused,
        currency: "GBP",
        is_active: true,
        reference_image_url: referenceImageUrl,
        image_only_search: imageOnlySearch,
      });

      if (error) throw error;

      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>Add item</h1>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Reference image (optional)</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setImageFile(file);
              setUploadedImageUrl(null);
              setError(null);
              setSuggestionStatus(null);

              if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);

              if (file) {
                setImagePreviewUrl(URL.createObjectURL(file));
              } else {
                setImagePreviewUrl(null);
                setImageOnlySearch(false);
              }
            }}
          />
        </label>

        {imagePreviewUrl ? (
          <>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Preview</div>
              <img
                src={imagePreviewUrl}
                alt="Reference preview"
                style={{
                  width: 160,
                  height: 160,
                  objectFit: "cover",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={suggestFromImage}
                disabled={suggesting}
                style={{ ...buttonStyle, opacity: suggesting ? 0.6 : 1 }}
              >
                {suggesting ? "Suggesting..." : "Suggest from image"}
              </button>

              <button
                type="button"
                onClick={() => setImageOnlySearch((v) => !v)}
                style={{
                  ...buttonStyle,
                  background: imageOnlySearch ? "#111" : "#fff",
                  color: imageOnlySearch ? "#fff" : "#111",
                }}
              >
                {imageOnlySearch ? "Image only search: ON" : "Image only search: OFF"}
              </button>
            </div>
          </>
        ) : null}

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Brand (optional)</span>
          <input style={{ padding: 10 }} placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Item name / keywords (optional)</span>
          <input style={{ padding: 10 }} placeholder="Item name / keywords" value={itemName} onChange={(e) => setItemName(e.target.value)} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Category (optional)</span>
          <input style={{ padding: 10 }} placeholder="Category (e.g. jacket)" value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Size (optional)</span>
          <input style={{ padding: 10 }} placeholder="Size (e.g. M, 32, UK 9)" value={size} onChange={(e) => setSize(e.target.value)} />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Max price (optional)</span>
          <input
            style={{ padding: 10 }}
            type="number"
            min={1}
            step="1"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Search query (optional)</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='e.g. "Carhartt Detroit jacket size M"'
            style={{ padding: 10, borderRadius: 10 }}
          />
          <span style={{ opacity: 0.7, fontSize: 12 }}>
            Leave blank to auto-build from available details, or use image-only search.
          </span>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Search frequency</span>
          <select
            value={searchFrequency}
            onChange={(e) => setSearchFrequency(e.target.value as "daily" | "weekly")}
            style={{ padding: 10, borderRadius: 10 }}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" checked={isPaused} onChange={(e) => setIsPaused(e.target.checked)} />
          <span style={{ fontWeight: 700 }}>Pause this search</span>
        </label>

        {error ? <div style={{ color: "crimson" }}>{error}</div> : null}
        {suggestionStatus ? (
  <div
    style={{
      border: "1px solid #ddd",
      borderRadius: 10,
      padding: 10,
      fontWeight: 700,
      background: "#f7f7f7",
    }}
  >
    {suggestionStatus}
  </div>
) : null}

        <button
          style={{ ...buttonStyle, padding: 10, opacity: loading ? 0.6 : 1 }}
          disabled={loading}
        >
          {loading ? "Saving..." : "Save tracked item"}
        </button>
      </form>
    </main>
  );
}