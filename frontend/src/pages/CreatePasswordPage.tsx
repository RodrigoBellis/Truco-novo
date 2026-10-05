import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/ui/Logo";
import { Button } from "../components/ui/Button";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { changePassword } from "../services/authService";
import { ApiError } from "../services/api";
import { homePathForRole } from "../utils/roles";
import "./CreatePasswordPage.css";

export function CreatePasswordPage() {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setError(null);

    if (newPassword.length < 4) {
      setError("A senha deve ter pelo menos 4 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(user.email, newPassword);
      updateUser({ mustChangePassword: false });
      showToast("success", "Senha criada com sucesso!");
      navigate(homePathForRole(user.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar sua senha.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="create-password-page page-enter">
      <div className="create-password-card">
        <Logo size={40} />

        <h1>Crie sua senha</h1>
        <p className="text-muted">
          Olá, <strong className="text-gold">{user?.name}</strong>! Por segurança, defina uma nova senha para a Temporada 2026 antes
          de continuar.
        </p>

        <form onSubmit={handleSubmit} className="create-password-form">
          <label className="create-password-field">
            <span>Nova senha</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Mínimo 4 caracteres"
              required
              autoFocus
            />
          </label>

          <label className="create-password-field">
            <span>Confirmar nova senha</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repita a senha"
              required
            />
          </label>

          {error && <p className="login-error">{error}</p>}

          <Button type="submit" isLoading={isSubmitting} className="login-submit">
            Salvar e continuar
          </Button>
        </form>
      </div>
    </div>
  );
}
