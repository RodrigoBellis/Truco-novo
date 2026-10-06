import { useRef, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Loading } from "../../components/ui/Loading";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { PlayerAvatar } from "../../components/ui/PlayerAvatar";
import { useAuth } from "../../hooks/useAuth";
import { useFetchData } from "../../hooks/useFetchData";
import { getTeams } from "../../services/teamsService";
import { uploadMyAvatar } from "../../services/playersService";
import { resizeImageToDataUrl } from "../../utils/image";
import "./ProfilePage.css";

export function ProfilePage() {
  const { user, logout, updateUser } = useAuth();
  const { data: teams, isLoading } = useFetchData(getTeams);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  if (isLoading) return <Loading fullHeight label="Carregando perfil..." />;

  const team = teams?.find((t) => t.id === user?.teamId);

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setUploadError("Escolha uma foto JPEG, PNG ou WebP.");
      return;
    }

    setUploadError(null);
    setUploadSuccess(false);
    setIsUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const { avatarUrl } = await uploadMyAvatar(dataUrl);
      updateUser({ avatarUrl });
      setUploadSuccess(true);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="page-enter">
      <PageHeader title="Perfil" subtitle="Seu perfil na 5ª Edição do Truco do Novo" />

      <Card className="profile-card" accent="gold">
        <div className="profile-avatar-picker">
          <PlayerAvatar name={user?.name ?? "Jogador"} avatarUrl={user?.avatarUrl} size="lg" />
          <div className="profile-avatar-actions">
            <Button type="button" variant="secondary" size="sm" disabled={isUploading} onClick={() => cameraInputRef.current?.click()}>
              {isUploading ? "Enviando foto..." : "Tirar foto"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={isUploading} onClick={() => galleryInputRef.current?.click()}>
              Escolher da galeria
            </Button>
          </div>
          <input ref={cameraInputRef} id="avatar-camera-input" type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="profile-avatar-input" onChange={handleAvatarChange} />
          <input ref={galleryInputRef} id="avatar-gallery-input" type="file" accept="image/jpeg,image/png,image/webp" className="profile-avatar-input" onChange={handleAvatarChange} />
        </div>

        <div className="profile-info">
          <strong>{user?.name}</strong>
          <span className="text-muted">{team ? `Dupla ${team.name}` : "Sem dupla definida"}</span>
          <div className="profile-badges">
            <Badge tone="gold">Jogador</Badge>
            {team && <Badge tone="green">{team.name}</Badge>}
          </div>
          <span className="profile-avatar-help">A foto fica pública para que todos possam ver você no campeonato. JPEG, PNG ou WebP.</span>
          {uploadError && <span className="profile-avatar-error" role="alert">{uploadError}</span>}
          {uploadSuccess && <span className="profile-avatar-success" role="status">Foto atualizada. Ela já aparece nas listas e nos jogos.</span>}
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
