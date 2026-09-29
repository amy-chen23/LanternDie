import type { ImagePickerAsset } from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const bucket = 'report-photos';
const maxBytes = 5 * 1024 * 1024;

export type Report = {
  id: string;
  created_at: string;
  photo_path: string;
  photo_url: string | null;
};

export async function loadReports(userId: string): Promise<Report[]> {
  const client = supabase;
  if (!client) throw new Error('Supabase is not configured.');

  const { data, error } = await client
    .from('reports')
    .select('id, created_at, photo_path')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return Promise.all((data ?? []).map(async (row) => {
    const { data: photo } = await client.storage
      .from(bucket)
      .createSignedUrl(row.photo_path, 3600);
    return { ...row, photo_url: photo?.signedUrl ?? null };
  }));
}

export async function submitReport(userId: string, asset: ImagePickerAsset): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const longestEdge = Math.max(asset.width, asset.height);
  const actions: ImageManipulator.Action[] = longestEdge > 1600
    ? [{ resize: asset.width >= asset.height ? { width: 1600 } : { height: 1600 } }]
    : [];
  const image = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    base64: true,
    compress: 0.75,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  if (!image.base64) throw new Error('Could not prepare the selected photo.');

  const bytes = decode(image.base64);
  if (bytes.byteLength > maxBytes) {
    throw new Error('This photo is over 5 MB after resizing. Please choose a smaller image.');
  }

  const path = `${userId}/${Crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: reportError } = await supabase.from('reports').insert({
    user_id: userId,
    photo_path: path,
  });
  if (reportError) {
    await supabase.storage.from(bucket).remove([path]);
    throw reportError;
  }
}
