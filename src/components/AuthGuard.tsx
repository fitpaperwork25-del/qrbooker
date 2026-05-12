import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/useAuth";
import SessionExpired from "./SessionExpired";
import { BG, MUTED } from "../constants/theme";

interface Props {
  children: ReactNode;
}

export default function AuthGuard({ children }: Props) {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: MUTED,
          fontFamily: "sans-serif",
        }}
      >
        Loading...
      </div>
    );
  }

  if (status === "expired") return <SessionExpired />;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;

  return <>{children}</>;
}
