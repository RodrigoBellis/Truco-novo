import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Loading } from "../ui/Loading";

export function RequireAuth() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading fullHeight label="Carregando sessão..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
