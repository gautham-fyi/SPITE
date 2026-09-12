import type { FileUIPart } from 'ai'
import { attachmentMediaType, isTextAttachment } from '@/lib/agent/attachment-types'

export const MAX_ATTACHMENTS = 8
export const MAX_FILE_BYTES = 80 * 1024 * 1024
const SERVER_UPLOAD_LIMIT = 4 * 1024 * 1024
const TEXT_INLINE_LIMIT = 400_000

export type AttachmentPhase = 'reading' | 'uploading' | 'ready' | 'error'

export { attachmentMediaType, inferMediaType, isTextAttachment } from '@/lib/agent/attachment-types'

async function uploadViaServer(file: File, mediaType: string): Promise<FileUIPart> {
  const form = new FormData()
  form.append('file', file)
  form.append('filename', file.name)
  form.append('contentType', mediaType)
  const res = await fetch('/api/r2-upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error('Upload failed')
  const { url } = await res.json() as { url?: string }
  if (!url) throw new Error('Upload URL missing')
  return { type: 'file', filename: file.name, mediaType, url }
}

async function uploadViaPresign(file: File, mediaType: string): Promise<FileUIPart> {
  const presignRes = await fetch('/api/r2-presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: mediaType,
      prefix: 'uploads',
    }),
  })
  if (!presignRes.ok) throw new Error('Could not start upload')
  const { presignedUrl, proxyUrl } = await presignRes.json() as {
    presignedUrl?: string
    proxyUrl?: string
  }
  if (!presignedUrl || !proxyUrl) throw new Error('Upload URL missing')
  const putRes = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mediaType },
    body: file,
  })
  if (!putRes.ok) throw new Error('Upload failed')
  return { type: 'file', filename: file.name, mediaType, url: proxyUrl }
}

export async function uploadAttachment(file: File): Promise<FileUIPart> {
  const mediaType = attachmentMediaType(file)
  if (file.size <= SERVER_UPLOAD_LIMIT) {
    try {
      return await uploadViaServer(file, mediaType)
    } catch {
      return uploadViaPresign(file, mediaType)
    }
  }
  try {
    return await uploadViaPresign(file, mediaType)
  } catch {
    return uploadViaServer(file, mediaType)
  }
}

export async function readTextAttachment(file: File) {
  if (!isTextAttachment({ name: file.name, type: file.type })) return undefined
  const text = await file.text()
  if (!text.trim()) return undefined
  return text.length > TEXT_INLINE_LIMIT
    ? `${text.slice(0, TEXT_INLINE_LIMIT)}\n\n[truncated]`
    : text
}

export async function loadChatAttachment(
  file: File,
  onPhase?: (phase: AttachmentPhase) => void,
): Promise<{
  uploaded: FileUIPart
  textContent?: string
}> {
  onPhase?.('reading')
  const textContent = await readTextAttachment(file)
  onPhase?.('uploading')
  const uploaded = await uploadAttachment(file)
  onPhase?.('ready')
  return { uploaded, textContent }
}
