export type PresignedUploadIntent = {
  uploadUrl: string;
  headers: Record<string, string>;
};

export async function putFileToPresignedUrl(uri: string, intent: PresignedUploadIntent): Promise<void> {
  const fileResponse = await fetch(uri);
  if (!fileResponse.ok) throw new Error(`Local file read failed (${fileResponse.status})`);
  const body = await fileResponse.blob();
  const uploadResponse = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: intent.headers,
    body,
  });
  if (!uploadResponse.ok) throw new Error(`Upload failed (${uploadResponse.status})`);
}
