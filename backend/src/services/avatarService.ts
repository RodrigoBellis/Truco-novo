import { supabaseAdmin } from "../data/supabaseClient.js";
import { store } from "../data/store.js";

export class AvatarError extends Error {}

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_BYTES = 2 * 1024 * 1024;

/** Recebe a imagem em data URL (base64), valida tipo/tamanho e sobe para o bucket público `avatars`. */
export async function uploadPlayerAvatar(playerId: string, dataUrl: string): Promise<string> {
  const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new AvatarError("Formato de imagem inválido.");

  const [, contentType, base64] = match;
  const extension = ALLOWED_TYPES[contentType];
  if (!extension) throw new AvatarError("Use uma imagem JPEG, PNG ou WebP.");

  const buffer = Buffer.from(base64, "base64");
  if (buffer.byteLength > MAX_BYTES) throw new AvatarError("A imagem deve ter até 2 MB.");

  const path = `${playerId}/avatar.${extension}`;
  const { error: uploadError } = await supabaseAdmin.storage.from("avatars").upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (uploadError) throw new AvatarError(`Falha ao enviar a foto: ${uploadError.message}`);

  const { data } = supabaseAdmin.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;

  await store.setPlayerAvatar(playerId, avatarUrl);
  return avatarUrl;
}
