import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const ACCENT = "#E8C547";
const BG = "#080808";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT = "#F0EDE8";
const MUTED = "#666666";
const SURFACE = "#111";
const RED = "#f44336";

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const BUSINESS_TYPES = [
  { value: "barbershop", label: "Barbershop" },
  { value: "salon",      label: "Salon" },
] as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "13px 16px",
  color: TEXT,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: MUTED,
  letterSpacing: 1,
  textTransform: "uppercase",
  marginBottom: 8,
};

type FormState = {
  businessName: string;
  email: string;
  password: string;
  type: string;
};

export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({
    businessName: "",
    email: "",
    password: "",
    type: "barbershop",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function insertBusiness(userId: string) {
    const slug = slugify(form.businessName) || `business-${Date.now()}`;
    const { error: bizError } = await supabase.from("businesses").insert({
      owner_id:            userId,
      name:                form.businessName.trim(),
      slug,
      type:                form.type,
      plan:                "starter",
      subscription_status: "trialing",
    });
    if (bizError) {
      setError(bizError.message);
      setLoading(false);
      return;
    }

    // Fire welcome email — best-effort, don't block navigation
    fetch("/api/send-welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email:        form.email.trim(),
        businessName: form.businessName.trim(),
        slug,
      }),
    }).catch(() => { /* silent — email failure never blocks the user */ });

    window.location.href = "/dashboard";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
    });

    console.log("[register] signUp result:", { authData, authError });

    // "User already registered" — account exists (possibly created via magic
    // link with no password). Try password sign-in first, then magic link.
    if (authError?.message?.toLowerCase().includes("user already registered") ||
        authError?.message?.toLowerCase().includes("already registered")) {

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });

      console.log("[register] signIn fallback:", { signInData, signInError });

      if (!signInError && signInData.session) {
        const userId = signInData.session.user.id;
        const { data: existing } = await supabase
          .from("businesses").select("id").eq("owner_id", userId).maybeSingle();
        if (existing) { window.location.href = "/dashboard"; return; }
        await insertBusiness(userId);
        return;
      }

      // Password sign-in failed — account may have been created via magic link.
      // Store pending business info and send a magic link to complete setup.
      localStorage.setItem("qw_pending_registration", JSON.stringify({
        businessName: form.businessName.trim(),
        type:         form.type,
      }));

      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: form.email.trim(),
        options: { shouldCreateUser: false },
      });

      console.log("[register] OTP fallback:", { otpError });

      if (!otpError) {
        setError(`We've sent a sign-in link to ${form.email.trim()}. Click it to complete your registration.`);
      } else {
        localStorage.removeItem("qw_pending_registration");
        setError("This email is already registered. Please log in or reset your password.");
      }
      setLoading(false);
      return;
    }

    if (authError) {
      console.error("[register] unexpected authError:", authError);
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Session is immediately available — email confirmation is off
    if (authData.session?.user.id) {
      await insertBusiness(authData.session.user.id);
      return;
    }

    // No immediate session — email confirmation required.
    // Store the business info so DashboardPage can create it after the user
    // confirms their email and lands on /dashboard (the onAuthStateChange
    // listener below only catches the SIGNED_IN in the *same* page load;
    // if the user opens the confirmation link in a new tab or navigates away
    // the listener is gone but the localStorage key survives).
    localStorage.setItem("qw_pending_registration", JSON.stringify({
      businessName: form.businessName.trim(),
      type:         form.type,
    }));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user.id) {
          subscription.unsubscribe();
          await insertBusiness(session.user.id);
        }
      }
    );

    setError("Check your email to confirm your account, then return here.");
    setLoading(false);
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: TEXT, fontFamily: "sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>

      <div style={{ width: "100%", maxWidth: 420 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <p style={{ fontSize: 11, letterSpacing: 4, color: ACCENT, fontWeight: 700, textTransform: "uppercase", marginBottom: 16 }}>
            Get started
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, margin: 0 }}>
            Create your account
          </h1>
          <p style={{ color: MUTED, fontSize: 14, marginTop: 10 }}>
            Already have one?{" "}
            <button
              onClick={() => navigate("/login")}
              style={{ background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 14, fontWeight: 700, padding: 0 }}
            >
              Log in
            </button>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div>
            <label style={labelStyle}>Business name</label>
            <input
              type="text"
              required
              placeholder="e.g. Classic Cuts Barbershop"
              value={form.businessName}
              onChange={set("businessName")}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Business type</label>
            <select
              value={form.type}
              onChange={set("type")}
              style={{ ...inputStyle, cursor: "pointer", appearance: "none" }}
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t.value} value={t.value} style={{ background: SURFACE }}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={form.email}
              onChange={set("email")}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              required
              placeholder="Min. 6 characters"
              value={form.password}
              onChange={set("password")}
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ background: "#1a0a0a", border: `1px solid ${RED}`, borderRadius: 8, padding: "12px 16px", color: RED, fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? "#a8903a" : ACCENT,
              color: BG,
              border: "none",
              borderRadius: 8,
              padding: "15px",
              fontSize: 15,
              fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: 0.5,
              transition: "background 0.15s",
              marginTop: 4,
            }}
          >
            {loading ? "Creating account…" : "Create account →"}
          </button>

        </form>

        <p style={{ textAlign: "center", color: MUTED, fontSize: 12, marginTop: 28, lineHeight: 1.7 }}>
          By registering you agree to our{" "}
          <button onClick={() => navigate("/terms")} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: 0 }}>Terms</button>
          {" "}and{" "}
          <button onClick={() => navigate("/privacy")} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: 0 }}>Privacy Policy</button>.
        </p>

      </div>
    </div>
  );
}
