"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setConfirmed(false);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setConfirmed(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bif-gradient-login)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "var(--bif-font-sans)",
    }}>
      <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>

        {/* Logo */}
        <div style={{
          fontFamily: "var(--bif-font-serif)",
          fontSize: 42,
          fontWeight: 400,
          color: "#fff",
          letterSpacing: "-0.5px",
          marginBottom: 8,
        }}>
          beloved<span style={{ color: "var(--bif-yellow)" }}>.</span>
        </div>

        {/* Tagline */}
        <p style={{
          fontSize: 14,
          color: "rgba(255,255,255,0.75)",
          marginBottom: 32,
          letterSpacing: "0.3px",
        }}>
          Find the things that matter to you
        </p>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.12)",
          border: "0.5px solid rgba(255,255,255,0.25)",
          borderRadius: "var(--bif-radius-xl)",
          padding: "28px 24px",
        }}>

          {/* Mode heading */}
          <div style={{
            fontSize: 16,
            fontWeight: 500,
            color: "#fff",
            marginBottom: 20,
            fontFamily: "var(--bif-font-serif)",
          }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </div>

          {/* Confirmation message after signup */}
          {confirmed && (
            <div style={{
              background: "rgba(255,255,255,0.15)",
              border: "0.5px solid rgba(255,255,255,0.3)",
              borderRadius: "var(--bif-radius-md)",
              padding: "12px 14px",
              fontSize: 13,
              color: "#fff",
              marginBottom: 16,
              lineHeight: 1.5,
            }}>
              Account created! Check your email to confirm your address, then log in.
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "var(--bif-radius-md)",
                border: "0.5px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 14,
                fontFamily: "var(--bif-font-sans)",
                boxSizing: "border-box",
              }}
            />
            <input
              type="password"
              placeholder={mode === "signup" ? "Password (min 6 chars)" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "var(--bif-radius-md)",
                border: "0.5px solid rgba(255,255,255,0.3)",
                background: "rgba(255,255,255,0.15)",
                color: "#fff",
                fontSize: 14,
                fontFamily: "var(--bif-font-sans)",
                boxSizing: "border-box",
              }}
            />

            {error && (
              <div style={{
                fontSize: 13,
                color: "#FFD0B5",
                textAlign: "left",
                padding: "8px 12px",
                background: "rgba(0,0,0,0.2)",
                borderRadius: "var(--bif-radius-md)",
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "11px",
                borderRadius: "var(--bif-radius-md)",
                border: "none",
                background: "var(--bif-yellow)",
                color: "var(--bif-navy)",
                fontSize: 14,
                fontWeight: 500,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                fontFamily: "var(--bif-font-sans)",
                marginTop: 4,
              }}
            >
              {loading ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          {/* Mode toggle */}
          <div style={{ marginTop: 16, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
            {mode === "login" ? "No account yet? " : "Already have an account? "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
                setConfirmed(false);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.9)",
                textDecoration: "underline",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "var(--bif-font-sans)",
                padding: 0,
              }}
            >
              {mode === "login" ? "Sign up free" : "Sign in"}
            </button>
          </div>

        </div>

        {/* Footer */}
        <p style={{
          marginTop: 24,
          fontSize: 12,
          color: "rgba(255,255,255,0.4)",
        }}>
          © Beloved Item Finder
        </p>

      </div>
    </main>
  );
}