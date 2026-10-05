import { useRef, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Loading } from "../../components/ui/Loading";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { getTeams } from "../../services/teamsService";
import { uploadMyAvatar } from "../../services/playersService";
import { resizeImageToDataUrl } from "../../utils/image";
import "./ProfilePage.css";

export function ProfilePage() {
  const { user, logout, updateUser } = useAuth();
  const { data: teams, isLoading } = useFetchData(getTeams);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (isLoading) return <Loading fullHeight label="Carregando perfil..." />;

  const team = teams?.find((t) => t.id === user?.teamId);

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Selecione um arquivo de imagem.");
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const { avatarUrl } = await uploadMyAvatar(dataUrl);
      updateUser({ avatarUrl });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="page-enter">
      <PageHeader title="Perfil" subtitle="Suas informações no Truco do Novo" />

      <Card className="profile-card" accent="gold">
        <button
          type="button"
          className="profile-avatar-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          aria-label="Alterar foto de perfil"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="profile-avatar-img" />
          ) : (
            <div className="profile-avatar">{user?.name.slice(0, 1).toUpperCase()}</div>
          )}
          <span className="profile-avatar-edit">{isUploading ? "Enviando..." : "Alterar foto"}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="profile-avatar-input"
          onChange={handleAvatarChange}
        />

        <div className="profile-info">
          <strong>{user?.name}</strong>
          <span className="text-muted">{team ? `Dupla ${team.name}` : "Sem dupla definida"}</span>
          <div className="profile-badges">
            <Badge tone="gold">Jogador</Badge>
            {team && <Badge tone="green">{team.name}</Badge>}
          </div>
          {uploadError && <span className="profile-avatar-error">{uploadError}</span>}
        </div>
      </Card>

      <Card className="profile-theme-card">
        <div className="profile-theme-info">
          <strong>Tema do aplicativo</strong>
          <span className="text-muted">Escolha entre claro e escuro. A preferência fica salva neste dispositivo.</span>
        </div>
        <ThemeToggle />
      </Card>

      <p className="profile-note text-faint">
        Para alterar sua senha, saia da conta e use a opção de criar nova senha ao entrar.
      </p>

      <Button variant="danger" onClick={logout}>
        Sair da conta
      </Button>
    </div>
  );
}
