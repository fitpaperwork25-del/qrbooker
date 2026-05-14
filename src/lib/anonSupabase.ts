import { createClient } from "@supabase/supabase-js";

// Dedicated client for public scan pages.
// Never carries an owner JWT — queries always run as the anon role regardless
// of whether an owner is signed in on the same browser.  Prevents any auth
// state from the shared client (expired tokens, SIGNED_OUT events) from
// affecting menu loading or order placement.
export const anonSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  {
    auth: {
      persistSession:      false,
      autoRefreshToken:    false,
      detectSessionInUrl:  false,
    },
  }
);
