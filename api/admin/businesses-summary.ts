import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Read-only Business Success data foundation — server-only, service-role
// access (never sent to the client), shared-secret authenticated
// server-to-server (same convention as Wegn Store's stores-summary
// endpoint). Returns only aggregate/identity fields that already exist
// in the schema (see supabase/schema.sql, supabase/admin_setup_v2.sql) -
// no customer/appointment detail, staff PIN, or financial totals are
// read or returned.
//
// Deliberately independent of get_admin_businesses() — the existing
// super-admin RPC used by src/pages/AdminPage.tsx — which is tied to one
// hardcoded browser session's JWT email (RAISE EXCEPTION unless
// auth.jwt()->>'email' matches) and is not reusable for a service-role,
// server-to-server call with no user session.

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sharedSecret = process.env.BOOKER_ADMIN_SHARED_SECRET;

interface BusinessSummary {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  locationCount: number;
  serviceCount: number;
  bookingCount: number;
  lastBookingAt: string | null;
  qrPrinted: boolean;
  staffTrained: boolean;
}

interface BusinessRow {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

function getSharedSecretHeader(req: VercelRequest): string | null {
  const header = req.headers["x-booker-admin-secret"];
  return typeof header === "string" ? header : null;
}

async function loadBusinessCounts(
  supabase: SupabaseClient,
  businessId: string
): Promise<Pick<BusinessSummary, "locationCount" | "serviceCount" | "bookingCount" | "lastBookingAt" | "qrPrinted" | "staffTrained">> {
  const [locationsRes, servicesRes, bookingsRes, lastBookingRes, checklistRes] = await Promise.all([
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    // menu_items has no business_id of its own — it hangs off menu_categories,
    // which does. !inner makes the filter on the joined column apply.
    supabase
      .from("menu_items")
      .select("id, menu_categories!inner(id)", { count: "exact", head: true })
      .eq("menu_categories.business_id", businessId),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase
      .from("orders")
      .select("created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("admin_checklist").select("qr_printed, staff_trained").eq("business_id", businessId).maybeSingle(),
  ]);

  const lastBookingRow = (lastBookingRes.data?.[0] as { created_at: string } | undefined) ?? null;
  const checklist = checklistRes.data as { qr_printed: boolean; staff_trained: boolean } | null;

  return {
    locationCount: locationsRes.count ?? 0,
    serviceCount: servicesRes.count ?? 0,
    bookingCount: bookingsRes.count ?? 0,
    lastBookingAt: lastBookingRow?.created_at ?? null,
    qrPrinted: checklist?.qr_printed ?? false,
    staffTrained: checklist?.staff_trained ?? false,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed. This endpoint is read-only." });
    return;
  }

  if (!sharedSecret || getSharedSecretHeader(req) !== sharedSecret) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    res.status(500).json({ error: "Supabase credentials are not configured on the server." });
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // "platform" is an internal/demo business type — excluded from the
    // client-facing list, same convention as get_admin_businesses().
    const { data: businesses, error } = await supabase
      .from("businesses")
      .select("id, name, type, created_at")
      .neq("type", "platform")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const summaries: BusinessSummary[] = await Promise.all(
      ((businesses ?? []) as BusinessRow[]).map(async (biz) => {
        const counts = await loadBusinessCounts(supabase, biz.id);
        return {
          id: biz.id,
          name: biz.name,
          type: biz.type,
          createdAt: biz.created_at,
          ...counts,
        };
      })
    );

    res.status(200).json({
      businessCount: summaries.length,
      businesses: summaries,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load business summary." });
  }
}
