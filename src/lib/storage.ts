import { createClient } from '@/lib/supabase/client';

export async function uploadAvatarDataUrlToStorage(
  dataUrlOrBlob: string | Blob,
  userId: string
): Promise<string | null> {
  const supabase = createClient();
  const filePath = `${userId}-${Date.now()}.jpg`;

  try {
    let blob: Blob;
    if (typeof dataUrlOrBlob === 'string') {
      const res = await fetch(dataUrlOrBlob);
      blob = await res.blob();
    } else {
      blob = dataUrlOrBlob;
    }

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return publicUrl;
  } catch (err) {
    console.error('Failed to upload avatar to Supabase Storage:', err);
    return null;
  }
}
