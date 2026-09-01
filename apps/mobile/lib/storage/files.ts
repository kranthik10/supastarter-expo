import { trpc } from '@repo/api';
import { inferContentType, validateAvatarAsset } from './client-policy';

export type UploadedFile = {
  fileId: string;
  key: string;
  contentType: string;
  size: number;
  status: 'ready';
};

type UploadOptions = {
  contentType?: string | null;
  filename?: string;
  size?: number | null;
  organizationId?: string;
  purpose?: 'avatar';
};

export async function uploadFile(uri: string, options: UploadOptions = {}): Promise<UploadedFile> {
  const filename = options.filename ?? uri.split('/').pop() ?? 'file';
  const fileResponse = await fetch(uri);
  if (!fileResponse.ok) throw new Error(`Local file read failed (${fileResponse.status})`);
  const blob = await fileResponse.blob();
  const contentType = inferContentType(filename, options.contentType ?? blob.type);
  if (!contentType) throw new Error('unsupported_file_type');
  const size = options.size ?? blob.size;
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('invalid_size');
  if (options.purpose === 'avatar') {
    const avatarValidation = validateAvatarAsset({ contentType, size });
    if (!avatarValidation.ok) throw new Error(avatarValidation.reason);
  }

  const intent = await trpc.storage.createUploadIntent.mutate({
    organizationId: options.organizationId,
    filename,
    contentType,
    size,
    purpose: options.purpose,
  });
  const uploadResponse = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: intent.requiredHeaders,
    body: blob,
  });
  if (!uploadResponse.ok) throw new Error(`Upload failed (${uploadResponse.status})`);

  const confirmed = await trpc.storage.confirmUpload.mutate({
    fileId: intent.fileId,
    purpose: options.purpose,
  });
  return { fileId: confirmed.fileId, key: confirmed.key, contentType, size, status: 'ready' };
}

export async function uploadAvatar(uri: string, options: { filename?: string; contentType?: string | null; size?: number | null } = {}) {
  return uploadFile(uri, { ...options, purpose: 'avatar' });
}
