import type { ImagePickerAsset } from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

const bucket = 'profile-photos';
const maxBytes = 2 * 1024 * 1024;

function photoPath(userId: string) {
  return `${userId}/avatar.jpg`;
}

export async function loadProfilePhoto(userId: string): Promise<string | null> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data: files, error: listError } = await supabase.storage.from(bucket).list(userId);
  if (listError) throw listError;
  if (!files?.some((file) => file.name === 'avatar.jpg')) return null;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(photoPath(userId), 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveProfilePhoto(userId: string, asset: ImagePickerAsset): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const side = Math.min(asset.width, asset.height);
  if (side <= 0) throw new Error('Could not read the selected photo.');
  const actions: ImageManipulator.Action[] = [
    { crop: { originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side } },
  ];
  if (side > 512) actions.push({ resize: { width: 512 } });

  const image = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    base64: true,
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  if (!image.base64) throw new Error('Could not prepare the selected photo.');

  const bytes = decode(image.base64);
  if (bytes.byteLength > maxBytes) throw new Error('This photo is too large. Please choose a smaller image.');

  const path = photoPath(userId);
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'image/jpeg',
    cacheControl: '0',
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return `${data.signedUrl}&v=${Date.now()}`;
}
