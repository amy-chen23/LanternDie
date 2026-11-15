type SignedFile = { path: string | null; signedUrl: string | null; error: string | null };
type Signer = { createSignedUrls(paths: string[], expiresIn: number): PromiseLike<{ data: SignedFile[] | null; error: unknown }> };
type PreviousPhoto = { photo_path: string; photo_url: string | null; photo_url_expires_at?: number };

/** Fetch small URL metadata, never all full-size photos before rendering cards. */
export async function loadReportPhotoUrls(storage: Signer, paths: string[], previous: PreviousPhoto[] = [], now = Date.now()) {
  const photos = new Map<string, { url: string | null; expiresAt: number }>();
  for (const photo of previous) {
    if (photo.photo_url && photo.photo_url_expires_at && photo.photo_url_expires_at > now + 60_000) {
      photos.set(photo.photo_path, { url: photo.photo_url, expiresAt: photo.photo_url_expires_at });
    }
  }
  const missing = [...new Set(paths)].filter(path => !photos.has(path));
  if (missing.length) {
    const { data, error } = await storage.createSignedUrls(missing, 3600);
    const requested = new Set(missing);
    if (!error) for (const file of data ?? []) {
      if (file.path && requested.has(file.path) && !file.error && file.signedUrl) {
        photos.set(file.path, { url: file.signedUrl, expiresAt: now + 3600_000 });
      }
    }
  }
  return photos;
}
