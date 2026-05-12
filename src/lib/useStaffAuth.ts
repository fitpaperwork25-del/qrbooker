import { supabase } from "./supabase";

const SESSION_KEY = "qrs_staff_session";

export interface StaffSession {
  bizId: string;
  bizName: string;
  bizSlug: string;
}

export function getStaffSession(): StaffSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StaffSession;
  } catch {
    return null;
  }
}

export function clearStaffSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function staffLogin(
  slug: string,
  pin: string
): Promise<{ session: StaffSession | null; error: string | null }> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, staff_pin")
    .eq("slug", slug.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) {
    return { session: null, error: "Restaurant not found. Check the ID and try again." };
  }
  if (!data.staff_pin) {
    return { session: null, error: "No staff PIN set for this restaurant. Ask your manager." };
  }
  if (data.staff_pin !== pin) {
    return { session: null, error: "Incorrect PIN. Try again." };
  }

  const session: StaffSession = {
    bizId: data.id as string,
    bizName: data.name as string,
    bizSlug: data.slug as string,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { session, error: null };
}
