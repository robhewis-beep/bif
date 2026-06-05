"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link";

const CATEGORIES = [
  "Fleece", "Jacket", "Coat", "Shirt", "T-Shirt",
  "Jumper / Knitwear", "Hoodie / Sweatshirt", "Trousers", "Jeans",
  "Shorts", "Dress", "Skirt", "Boots", "Trainers / Sneakers",
  "Shoes", "Sandals", "Bag", "Belt", "Hat / Cap",
  "Scarf / Gloves", "Jewellery", "Watch", "Sunglasses", "Other",
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
  const [platforms, setPlatforms] = useState<string[]>(["ebay"]);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  const [suggesting, setSuggesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!imageFile) { setError("Please choose an image first."); return; }

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
        throw new Error(`Image suggest returned non-JSON: ${text.slice(0, 120)}`);
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

      const filledCount = [s.brand, s.category, s.keywords].filter(Boolean).length;
      setSuggestionStatus(
        filledCount > 0
          ? "Suggestions added — please check and edit before saving."
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
        platforms: platforms,
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "var(--bif-radius-md)" as any,
    border: "1px solid var(--bif-border)",
    background: "var(--bif-bg)",
    color: "var(--bif-text)",
    fontSize: 14,
    fontFamily: "var(--bif-font-sans)",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
    fontSize: 14,
    fontWeight: 500,
    color: "var(--bif-text)",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bif-bg)",
      fontFamily: "var(--bif-font-sans)",
    }}>

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
        <Link href="/dashboard" className="bif-logo" style={{ textDecoration: "none" }}>
          beloved<span>.</span>
        </Link>
        <Link href="/dashboard" className="bif-btn" style={{ fontSize: 13 }}>
          ← Back to dashboard
        </Link>
      </nav>

      {/* Page content */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px 60px" }}>

        {/* Header */}
        <div className="bif-eyebrow" style={{ marginBottom: 8 }}>New search</div>
        <h1 style={{
          fontFamily: "var(--bif-font-serif)",
          fontSize: 26,
          fontWeight: 400,
          color: "var(--bif-text)",
          margin: "0 0 6px",
        }}>
          Add a tracked item
        </h1>
        <p style={{ fontSize: 13, color: "var(--bif-mauve)", margin: "0 0 28px" }}>
          We'll search for this automatically and alert you when something is found.
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 20 }}>

          {/* IMAGE UPLOAD */}
          <div style={{
            background: "var(--bif-card)",
            border: "1px solid var(--bif-border)",
            borderRadius: "var(--bif-radius-lg)",
            padding: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, color: "var(--bif-text)" }}>
              Reference image
              <span style={{ fontWeight: 400, fontSize: 12, color: "var(--bif-mauve)", marginLeft: 6 }}>optional</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--bif-mauve)", marginBottom: 12 }}>
              Upload a photo of the item — we'll use it to improve search accuracy
            </div>

            {/* File input styled as a button */}
            <label style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 16px",
              borderRadius: "var(--bif-radius-md)",
              border: "1px solid var(--bif-border)",
              background: "var(--bif-bg)",
              color: "var(--bif-text)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}>
              📎 Choose image
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
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
              <div style={{ marginTop: 16 }}>
                <img
                  src={imagePreviewUrl}
                  alt="Reference preview"
                  style={{
                    width: 120,
                    height: 120,
                    objectFit: "cover",
                    borderRadius: 10,
                    border: "1px solid var(--bif-border)",
                    display: "block",
                    marginBottom: 12,
                  }}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={suggestFromImage}
                    disabled={suggesting}
                    className="bif-btn bif-btn-dark"
                    style={{ fontSize: 13, opacity: suggesting ? 0.6 : 1 }}
                  >
                    {suggesting ? "Analysing…" : "✦ Suggest from image"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageOnlySearch((v) => !v)}
                    className="bif-btn"
                    style={{
                      fontSize: 13,
                      background: imageOnlySearch ? "var(--bif-amber)" : undefined,
                      color: imageOnlySearch ? "#fff" : undefined,
                      borderColor: imageOnlySearch ? "var(--bif-amber)" : undefined,
                    }}
                  >
                    {imageOnlySearch ? "Image only: ON" : "Image only: OFF"}
                  </button>
                </div>
              </div>
            )}

            {suggestionStatus && (
              <div style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: "var(--bif-radius-md)",
                background: "var(--bif-bg)",
                border: "1px solid var(--bif-border)",
                fontSize: 13,
                color: "var(--bif-mauve)",
              }}>
                ✓ {suggestionStatus}
              </div>
            )}
          </div>

          {/* ITEM DETAILS CARD */}
          <div style={{
            background: "var(--bif-card)",
            border: "1px solid var(--bif-border)",
            borderRadius: "var(--bif-radius-lg)",
            padding: 20,
            display: "grid",
            gap: 16,
          }}>
            <div style={{
              fontSize: 11,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "var(--bif-mauve)",
              fontWeight: 500,
            }}>
              Item details
            </div>

            {/* BRAND */}
            <label style={labelStyle}>
              Brand
              <input
                style={inputStyle}
                placeholder="e.g. Carhartt, Patagonia, Levi's"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </label>

            {/* CATEGORY */}
            <label style={labelStyle}>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={inputStyle}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            {/* KEYWORDS */}
            <label style={labelStyle}>
              Keywords
              <input
                style={inputStyle}
                placeholder="e.g. zip-up, vintage, oversized, corduroy"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
              <span style={{ fontSize: 12, color: "var(--bif-mauve)", fontWeight: 400 }}>
                Describe distinctive features that make this item unique
              </span>
            </label>

            {/* GENDER */}
            <label style={labelStyle}>
              Gender
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                style={inputStyle}
              >
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>

            {/* SIZE & COLOUR */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={labelStyle}>
                Size
                <input
                  style={inputStyle}
                  placeholder="e.g. M, 32, UK 9"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                />
              </label>
              <label style={labelStyle}>
                Colour
                <input
                  style={inputStyle}
                  placeholder="e.g. navy, olive"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
            </div>

            {/* CONDITION */}
            <label style={labelStyle}>
              Condition
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                style={inputStyle}
              >
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          {/* SEARCH SETTINGS CARD */}
          <div style={{
            background: "var(--bif-card)",
            border: "1px solid var(--bif-border)",
            borderRadius: "var(--bif-radius-lg)",
            padding: 20,
            display: "grid",
            gap: 16,
          }}>
            <div style={{
              fontSize: 11,
              letterSpacing: "1.2px",
              textTransform: "uppercase",
              color: "var(--bif-mauve)",
              fontWeight: 500,
            }}>
              Search settings
            </div>

            {/* MAX PRICE */}
            <label style={labelStyle}>
              Max price (£)
              <input
                style={inputStyle}
                type="number"
                min={1}
                step="1"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
            {/* PLATFORMS */}
            <label style={labelStyle}>
              Search platforms
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                {["ebay", "etsy"].map((p) => (
                  <label key={p} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 400,
                    cursor: "pointer",
                    padding: "6px 12px",
                    borderRadius: "var(--bif-radius-md)",
                    border: "1px solid var(--bif-border)",
                    background: "var(--bif-bg)",
                  }}>
                    <input
                      type="checkbox"
                      checked={platforms.includes(p)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPlatforms((prev) => [...prev, p]);
                        } else {
                          setPlatforms((prev) => prev.filter((x) => x !== p));
                        }
                      }}
                    />
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </label>
                ))}
              </div>
              <span style={{ fontSize: 12, color: "var(--bif-mauve)", fontWeight: 400 }}>
                Select which platforms to search
              </span>
            </label>

            {/* FREQUENCY */}
            <label style={labelStyle}>
              Search frequency
              <select
                value={searchFrequency}
                onChange={(e) => setSearchFrequency(e.target.value as "daily" | "weekly")}
                style={inputStyle}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
          </div>

          {/* SEARCH PREVIEW */}
          {previewQuery && (
            <div style={{
              padding: "12px 16px",
              borderRadius: "var(--bif-radius-md)",
              background: "var(--bif-card)",
              border: "1px solid var(--bif-border)",
              borderLeft: "3px solid var(--bif-amber)",
            }}>
              <div style={{
                fontSize: 10,
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                color: "var(--bif-mauve)",
                marginBottom: 4,
                fontWeight: 500,
              }}>
                Search preview
              </div>
              <div style={{
                fontFamily: "var(--bif-font-serif)",
                fontSize: 15,
                color: "var(--bif-text)",
              }}>
                {previewQuery}
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: "10px 14px",
              borderRadius: "var(--bif-radius-md)",
              background: "rgba(162,45,45,0.08)",
              border: "1px solid rgba(162,45,45,0.2)",
              fontSize: 13,
              color: "#A32D2D",
            }}>
              {error}
            </div>
          )}

          {/* SUBMIT */}
          <button
            type="submit"
            disabled={loading}
            className="bif-btn bif-btn-dark"
            style={{
              padding: "12px 24px",
              fontSize: 14,
              opacity: loading ? 0.6 : 1,
              justifyContent: "center",
            }}
          >
            {loading ? "Saving…" : "Save tracked item"}
          </button>

        </form>
      </div>
    </div>
  );
}