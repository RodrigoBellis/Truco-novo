import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Loading } from "../components/ui/Loading";
import { entryPathForUser } from "../utils/playerEntry";

export function RootRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <Loading fullHeight label="Carregando..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.mustChangePassword) {
    return <Navigate to="/criar-senha" replace />;
  }

  return <Navigate to={entryPathForUser(user)} replace />;
}
