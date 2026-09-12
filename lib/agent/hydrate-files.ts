import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getR2Client, toFalFetchableUrl } from '@/lib/r2-upload'
import { inferMediaType, isTextAttachment } from '@/lib/agent/attachment-types'
import type { UIMessage, UIMessagePart } from 'ai'

const TEXT_INLINE_LIMIT = 400_000
const DATA_URL_LIMIT = 8_000_000

function keyFromProxyUrl(url: string) {
  const marker = '/api/r2-image/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length).split('?')[0])
}

async function readR2Object(url: string) {
  const key = keyFromProxyUrl(url)
  if (!key || !process.env.R2_BUCKET_NAME) return null
  const response = await getR2Client().send(
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }),
  )
  const bytes = await response.Body?.transformToByteArray()
  if (!bytes) return null
  return { bytes, contentType: response.ContentType }
}

function toDataUrl(bytes: Uint8Array, mediaType: string) {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString('base64')}`
}

function attachedNote(filename: string | undefined, body: string) {
  const name = filename || 'file'
  return `\n\nAttached file "${name}":\n\n${body}`
}

/** Rewrite cookie-only R2 proxy URLs so the model can read attachments.
 *  Text documents are inlined. Images and PDFs become data URLs or signed URLs. */
export async function hydrateFileParts(messages: UIMessage[]): Promise<UIMessage[]> {
  return Promise.all(
    messages.map(async (message) => {
      const parts: UIMessagePart[] = []
      for (const part of message.parts) {
        if (part.type !== 'file' || typeof part.url !== 'string') {
          parts.push(part)
          continue
        }

        const mediaType = inferMediaType(part.filename, part.mediaType || 'application/octet-stream')
        const label = part.filename || 'file'

        if (part.url.startsWith('data:')) {
          parts.push({ ...part, mediaType })
          continue
        }

        if (isTextAttachment({ name: part.filename, mediaType })) {
          const alreadyInlined = message.parts.some((existing) => (
            existing.type === 'text'
            && label
            && existing.text.includes(`Attached file "${label}"`)
          ))
          if (alreadyInlined) continue
          try {
            const object = await readR2Object(part.url)
            const text = object ? new TextDecoder('utf-8').decode(object.bytes) : null
            if (text?.trim()) {
              const clipped = text.length > TEXT_INLINE_LIMIT
                ? `${text.slice(0, TEXT_INLINE_LIMIT)}\n\n[truncated]`
                : text
              parts.push({ type: 'text', text: attachedNote(label, clipped) })
              continue
            }
          } catch (err) {
            console.error('[agent] failed to read text attachment', err)
          }
          parts.push({ type: 'text', text: `\n\n[Could not read attached file "${label}".]` })
          continue
        }

        const wantsBytes = mediaType.startsWith('image/') || mediaType === 'application/pdf'
        if (wantsBytes) {
          try {
            const object = await readR2Object(part.url)
            if (object && object.bytes.byteLength <= DATA_URL_LIMIT) {
              parts.push({
                ...part,
                mediaType,
                url: toDataUrl(object.bytes, mediaType),
              })
              continue
            }
          } catch (err) {
            console.error('[agent] failed to load binary attachment', err)
          }
        }

        const signed = await toFalFetchableUrl(part.url)
        if (signed && (signed.startsWith('http://') || signed.startsWith('https://') || signed.startsWith('data:'))) {
          parts.push({ ...part, mediaType, url: signed })
          continue
        }

        if (part.url.startsWith('http://') || part.url.startsWith('https://')) {
          parts.push({ ...part, mediaType })
          continue
        }

        parts.push({
          type: 'text',
          text: `\n\n[Attached ${label} could not be loaded for the model.]`,
        })
      }
      return { ...message, parts }
    }),
  )
}
