import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import sharp from 'sharp'
import { getR2Client } from '@/lib/r2-upload'

const ALLOWED = new Set([240, 480, 720])
const JPEG_QUALITY = 68
const MAX_SOURCE_BYTES = 25 * 1024 * 1024

export function snapPreviewWidth(raw: string | null): number | null {
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return null
  if (ALLOWED.has(n)) return n
  if (n <= 240) return 240
  if (n <= 480) return 480
  return 720
}

export function previewObjectKey(sourceKey: string, width: number): string {
  return `previews/w${width}q${JPEG_QUALITY}/${sourceKey}.jpg`
}

function isImageContentType(type: string | undefined, key: string): boolean {
  const t = (type || '').split(';')[0].trim().toLowerCase()
  if (t.startsWith('image/') && t !== 'image/svg+xml') return true
  return /\.(png|jpe?g|webp|gif|avif|bmp|tiff?)$/i.test(key)
}

function isMissing(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  return e?.name === 'NotFound' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404
}

async function presign(key: string): Promise<string> {
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }),
    { expiresIn: 3600 },
  )
}

// Returns a 1-hour presigned URL for a cached downscale of `sourceKey`.
// Builds the JPEG on first miss and stores it next to the original.
// Returns null when the source is not a still (caller 302s the original).
export async function presignPreviewOrNull(
  sourceKey: string,
  width: number,
): Promise<string | null> {
  if (sourceKey.startsWith('previews/')) return null

  const thumbKey = previewObjectKey(sourceKey, width)
  const bucket = process.env.R2_BUCKET_NAME!
  const client = getR2Client()

  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: thumbKey }))
    return presign(thumbKey)
  } catch (err) {
    if (!isMissing(err)) throw err
  }

  const source = await client.send(new GetObjectCommand({ Bucket: bucket, Key: sourceKey }))
  const length = source.ContentLength ?? 0
  if (length > MAX_SOURCE_BYTES) return null
  if (!isImageContentType(source.ContentType, sourceKey)) return null

  const bytes = await source.Body?.transformToByteArray()
  if (!bytes || bytes.length === 0) return null

  let jpeg: Buffer
  try {
    jpeg = await sharp(Buffer.from(bytes), { failOn: 'none', animated: false })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer()
  } catch (err) {
    console.error('[r2-preview] sharp failed for', sourceKey, err)
    return null
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: thumbKey,
      Body: jpeg,
      ContentType: 'image/jpeg',
    }),
  )

  return presign(thumbKey)
}
