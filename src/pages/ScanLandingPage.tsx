import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Biz = { id: string; name: string };
type Loc = { id: string; name: string; label: string | null };

const gold   = "#C9823A";
const dark   = "#0f0f0f";
const card   = "#1a1a1a";
const border = "#2a2a2a";
const text   = "#f0f0f0";
const muted  = "#888";

export default function ScanLandingPage() {
  const { bizSlug } = useParams<{ bizSlug: string }>();
  const navigate = useNavigate();

  const [biz, setBiz]           = useState<Biz | null>(null);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  useEffect(() => {
    async function load() {
      const { data: bizData } = await supabase
        .from("businesses")
        .select("id, name")
        .eq("slug", bizSlug ?? "")
        .maybeSingle();

      if (!bizData) {
        setError("Restaurant not found.");
        setLoading(false);
        return;
      }

      setBiz(bizData as Biz);

      const { data: locData } = await supabase
        .from("locations")
        .select("id, name, label")
        .eq("business_id", bizData.id)
        .eq("is_active", true)
        .order("name");

      const locs = (locData ?? []) as Loc[];

      if (locs.length === 1) {
        navigate(`/scan/${bizData.id}/${locs[0].id}`, { replace: true });
        return;
      }

      setLocations(locs);
      setLoading(false);
    }
    void load();
  }, [bizSlug, navigate]);

  if (loading) {
    return (
      <div style={{ background: dark, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${border}`, borderTop: `3px solid ${gold}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (error || locations.length === 0) {
    return (
      <div style={{ background: dark, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: muted, fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <div>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🍽️</div>
          <p style={{ fontSize: 16, color: text, marginBottom: 6 }}>{error || "No tables available right now."}</p>
          <p style={{ fontSize: 13 }}>Please ask your server for assistance.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: dark, minHeight: "100vh", color: text, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ padding: "28px 20px 16px", borderBottom: `1px solid ${border}` }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: gold }}>{biz?.name}</h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: muted }}>Select your table to view the menu</p>
      </div>

      <div style={{ padding: "20px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
        {locations.map((loc) => (
          <button
            key={loc.id}
            onClick={() => navigate(`/scan/${biz!.id}/${loc.id}`)}
            style={{
              background: card,
              border: `1px solid ${border}`,
              borderRadius: 12,
              padding: "20px 16px",
              color: text,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              textAlign: "center",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = gold)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = border)}
          >
            {loc.label || loc.name}
          </button>
        ))}
      </div>
    </div>
  );
}
