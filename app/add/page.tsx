"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const CATEGORIES = [
  "Fleece",
  "Jacket",
  "Coat",
  "Shirt",
  "T-Shirt",
  "Jumper / Knitwear",
  "Hoodie / Sweatshirt",
  "Trousers",
  "Jeans",
  "Shorts",
  "Dress",
  "Skirt",
  "Boots",
  "Trainers / Sneakers",
  "Shoes",
  "Sandals",
  "Bag",
  "Belt",
  "Hat / Cap",
  "Scarf / Gloves",
  "Jewellery",
  "Watch",
  "Sunglasses",
  "Other",
];

const CONDITIONS = ["Any", "New", "Used - Excellent", "Used - Good", "Used - Fair"];
const GENDERS = ["Unisex", "Men", "Women", "Boys", "Girls"];

export default function AddPage() {
  const router = useRouter();

  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("Fleece");
  const [keywords, setKeywords] = useState("");
  const [gender, setGender] = useState("Unisex");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [condition, setCondition] = useState("Any");
  const [maxPrice, setMaxPrice] = useState<number | "">(100);
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

  const inputStyle: React.CSSProperties = {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #ddd",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
  };

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
      .upload(filePath, imageFile, { cacheControl: "3600", upsert: false });

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
      if (!user) { router.push("/login"); return; }

      const imageUrl = await uploadReferenceImage(user.id);
      if (!imageUrl) throw new Error("Could not upload image for analysis.");

      const resp = await fetch("/api/image/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });

      const text = await resp.text();
      let out: any;
      try { out = JSON.parse(text); } catch {
        throw new Error(`Image suggest route returned non-JSON: ${text.slice(0, 120)}`);
      }

      if (!resp.ok) throw new Error(out?.error ?? "Image suggestion failed");

      const s = out?.suggestion;
      if (!s) throw new Error("No suggestion returned");

      if (s.brand) setBrand(s.brand);
if (s.category) {
  const matched = CATEGORIES.find(
    (c) => c.toLowerCase() === s.category.toLowerCase()
  );
  setCategory(matched ?? "Other");
}
if (s.keywords) setKeywords(s.keywords);
if (s.color) setColor(s.color);

      const filledCount = [s.brand, s.category, s.searchQuery].filter(Boolean).length;
      setSuggestionStatus(
        filledCount > 0
          ? "Suggestions added from image — please check and edit before saving."
          : "No strong suggestions found from this image."
      );
    } catch (err: any) {
      setSuggestionStatus(null);
      setError(err?.message ?? "Could not suggest from image");
    } finally {
      setSuggesting(false);
    }
  }

  function buildSearchQuery() {
    const parts: string[] = [];
    if (brand.trim()) parts.push(brand.trim());
    if (category && category !== "Other") parts.push(category);
    if (keywords.trim()) parts.push(keywords.trim());
    if (gender && gender !== "Unisex") parts.push(gender);
    if (size.trim()) parts.push(size.trim());
    if (color.trim()) parts.push(color.trim());
    return parts.join(" ").trim();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) { router.push("/login"); return; }

      const referenceImageUrl = await uploadReferenceImage(user.id);

      const hasAnyText = brand.trim() || category || keywords.trim() || size.trim();
      if (!hasAnyText && !referenceImageUrl) {
        throw new Error("Please provide either some search details or a reference image.");
      }
      if (imageOnlySearch && !referenceImageUrl) {
        throw new Error("Image only search requires a reference image.");
      }

      const autoQuery = buildSearchQuery();

      const { error } = await supabase.from("tracked_items").insert({
        user_id: user.id,
        brand: brand.trim() || null,
        item_name: keywords.trim() || null,
        category: category || null,
        size: size.trim() || null,
        color: color.trim() || null,
        condition: condition !== "Any" ? condition : null,
        search_query: autoQuery || null,
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

  const previewQuery = buildSearchQuery();

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>Add tracked item</h1>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: "grid", gap: 14 }}>

        {/* IMAGE */}
        <label style={labelStyle}>
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
              setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
              if (!file) setImageOnlySearch(false);
            }}
          />
        </label>

        {imagePreviewUrl && (
          <>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Preview</div>
              <img
                src={imagePreviewUrl}
                alt="Reference preview"
                style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 12, border: "1px solid #ddd" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={suggestFromImage} disabled={suggesting}
                style={{ ...buttonStyle, opacity: suggesting ? 0.6 : 1 }}>
                {suggesting ? "Suggesting..." : "Suggest from image"}
              </button>
              <button type="button" onClick={() => setImageOnlySearch((v) => !v)}
                style={{ ...buttonStyle, background: imageOnlySearch ? "#111" : "#fff", color: imageOnlySearch ? "#fff" : "#111" }}>
                {imageOnlySearch ? "Image only: ON" : "Image only: OFF"}
              </button>
            </div>
          </>
        )}

        {suggestionStatus && (
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 10, fontWeight: 700, background: "#f7f7f7" }}>
            {suggestionStatus}
          </div>
        )}

        {/* BRAND */}
        <label style={labelStyle}>
          <span style={{ fontWeight: 700 }}>Brand <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></span>
          <input style={inputStyle} placeholder="e.g. Carhartt, Patagonia, Levi's" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>

        {/* CATEGORY */}
        <label style={labelStyle}>
          <span style={{ fontWeight: 700 }}>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        {/* KEYWORDS */}
        <label style={labelStyle}>
          <span style={{ fontWeight: 700 }}>Keywords <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></span>
          <input
            style={inputStyle}
            placeholder="e.g. zip-up, vintage, oversized, corduroy, quilted"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
          <span style={{ opacity: 0.6, fontSize: 12 }}>Describe distinctive features that make this item unique</span>
        </label>

        {/* GENDER */}
        <label style={labelStyle}>
          <span style={{ fontWeight: 700 }}>Gender</span>
          <select value={gender} onChange={(e) => setGender(e.target.value)} style={inputStyle}>
            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>

        {/* SIZE & COLOUR — side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>
            <span style={{ fontWeight: 700 }}>Size <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></span>
            <input style={inputStyle} placeholder="e.g. M, 32, UK 9" value={size} onChange={(e) => setSize(e.target.value)} />
          </label>
          <label style={labelStyle}>
            <span style={{ fontWeight: 700 }}>Colour <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></span>
            <input style={inputStyle} placeholder="e.g. navy, olive, burgundy" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>

        {/* CONDITION */}
        <label style={labelStyle}>
          <span style={{ fontWeight: 700 }}>Condition</span>
          <select value={condition} onChange={(e) => setCondition(e.target.value)} style={inputStyle}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        {/* MAX PRICE */}
        <label style={labelStyle}>
          <span style={{ fontWeight: 700 }}>Max price in £ <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></span>
          <input
            style={inputStyle}
            type="number"
            min={1}
            step="1"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>

        {/* SEARCH FREQUENCY */}
        <label style={labelStyle}>
          <span style={{ fontWeight: 700 }}>Search frequency</span>
          <select value={searchFrequency} onChange={(e) => setSearchFrequency(e.target.value as "daily" | "weekly")} style={inputStyle}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>

        {/* SEARCH PREVIEW */}
        {previewQuery && (
          <div style={{ background: "#f7f7f7", border: "1px solid #ddd", borderRadius: 10, padding: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12, opacity: 0.6, marginBottom: 4 }}>SEARCH PREVIEW</div>
            <div style={{ fontWeight: 700 }}>{previewQuery}</div>
          </div>
        )}

        {error && <div style={{ color: "crimson" }}>{error}</div>}

        <button style={{ ...buttonStyle, padding: 12, opacity: loading ? 0.6 : 1, background: "#111", color: "#fff" }} disabled={loading}>
          {loading ? "Saving..." : "Save tracked item"}
        </button>

      </form>
    </main>
  );
}