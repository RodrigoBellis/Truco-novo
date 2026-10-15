import { createContext } from "react";
import type { AuthUser } from "@truco/shared";
import type { LoginIdentifier } from "../services/authService";

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (identifier: LoginIdentifier, password: string) => Promise<AuthUser>;
  logout: () => void;
  updateUser: (patch: Partial<AuthUser>) => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
