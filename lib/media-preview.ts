// Canvas and library tiles are a few hundred pixels wide. Pointing <img>
// at the full 2K/4K R2 original makes every board reopen pull megabytes
// per node. Append ?preview=N so /api/r2-image can 302 to a cached JPEG
// instead. Lightbox, generate, and fal signed URLs stay on the original.

export type PreviewSize = 'node' | 'thumb'

const WIDTH: Record<PreviewSize, number> = {
  node: 720,
  thumb: 240,
}

const SKIP_EXT = /\.(mp4|webm|mov|m4v|mp3|wav|m4a|ogg|aac|flac)(\?|$)/i

export function mediaPreviewUrl(
  url: string | null | undefined,
  size: PreviewSize = 'node',
): string {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  if (SKIP_EXT.test(url)) return url

  const marker = '/api/r2-image/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url

  const after = url.slice(idx + marker.length)
  // Signed fal tokens and already-generated preview objects stay as-is.
  if (after.startsWith('s/') || after.startsWith('previews/')) return url
  if (/[?&]preview=/.test(url)) return url

  const width = WIDTH[size]
  return `${url}${url.includes('?') ? '&' : '?'}preview=${width}`
}
