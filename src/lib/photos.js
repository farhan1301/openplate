import { supabase } from './supabase'

const BUCKET = 'meal-photos'
const MAX_SIDE = 1400

// Phone photos are often 4–10 MB; shrink to a card-friendly JPEG before upload.
async function shrink(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob || file
  } catch {
    return file
  }
}

/** Uploads a photo to Supabase Storage and returns its public URL. */
export async function uploadPhoto(file) {
  const body = await shrink(file)
  const type = body.type || 'image/jpeg'
  const ext = { 'image/png': 'png', 'image/webp': 'webp' }[type] || 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: type, cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
