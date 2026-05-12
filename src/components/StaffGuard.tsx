import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getStaffSession } from "../lib/useStaffAuth";

interface Props {
  children: ReactNode;
}

export default function StaffGuard({ children }: Props) {
  const session = getStaffSession();
  if (!session) return <Navigate to="/staff-login" replace />;
  return <>{children}</>;
}
