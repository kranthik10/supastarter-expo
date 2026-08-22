import { api } from '../api/client';

export type UploadedFile = {
  url: string;
  key: string;
};

type PresignResponse = {
  uploadUrl: string;
  key: string;
  publicUrl: string;
};

/**
 * Uploads a local file through a presigned-URL flow:
 * 1. ask the backend for an upload URL (POST /files/presign)
 * 2. PUT the raw bytes to object storage (S3, R2, MinIO, …)
 * 3. return the public URL
 *
 * Works with any backend that implements POST /files/presign, e.g.:
 *   { "contentType": "image/jpeg", "size": 12345 }
 *   → { "uploadUrl": "…", "key": "…", "publicUrl": "…" }
 */
export async function uploadFile(
  uri: string,
  options: { contentType?: string } = {}
): Promise<UploadedFile> {
  const contentType = options.contentType ?? 'application/octet-stream';

  const presign = await api.post<PresignResponse>('/files/presign', {
    contentType,
    fileName: uri.split('/').pop() ?? 'file',
  });

  const fileRes = await fetch(uri);
  const bytes = await fileRes.blob();

  const uploadRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  });

  if (!uploadRes.ok) throw new Error(`Upload failed (${uploadRes.status})`);

  return { url: presign.publicUrl, key: presign.key };
}

export async function deleteFile(key: string): Promise<void> {
  await api.delete(`/files/${encodeURIComponent(key)}`);
}
