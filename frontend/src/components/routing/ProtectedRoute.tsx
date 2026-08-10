import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Loading } from "../ui/Loading";
import type { UserRole } from "@truco/shared";
import { isAdminRole, homePathForRole } from "../../utils/roles";

interface ProtectedRouteProps {
  role: UserRole;
}

export function ProtectedRoute({ role }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading fullHeight label="Carregando sessão..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const allowed = role === "admin" ? isAdminRole(user.role) : user.role === role;
  if (!allowed) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  if (user.mustChangePassword) {
    return <Navigate to="/criar-senha" replace />;
  }

  return <Outlet />;
}
