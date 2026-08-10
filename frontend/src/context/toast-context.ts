import { createContext } from "react";
import type { ToastMessage } from "../types";

export interface ToastContextValue {
  toasts: ToastMessage[];
  showToast: (type: ToastMessage["type"], message: string) => void;
  dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);
