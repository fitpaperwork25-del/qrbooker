import { useState, useEffect } from "react";
import type { Session, AuthError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "expired";

function hasStaleTokens(): boolean {
  return Object.keys(localStorage).some(
    (k) => k.startsWith("sb-") && k.endsWith("-auth-token")
  );
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
        setStatus("authenticated");
      } else {
        setStatus(hasStaleTokens() ? "expired" : "unauthenticated");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setSession(session);
        setStatus("authenticated");
      } else if (event === "SIGNED_OUT") {
        setSession(null);
        setStatus("unauthenticated");
      } else {
        setSession(null);
        setStatus(hasStaleTokens() ? "expired" : "unauthenticated");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<AuthError | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  };

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
    setSession(null);
    setStatus("unauthenticated");
  };

  return { session, status, signIn, signOut };
}
