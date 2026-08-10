import { useToast } from "../../hooks/useToast";
import "./ToastContainer.css";

const ICONS: Record<string, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{ICONS[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
          <button type="button" className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
