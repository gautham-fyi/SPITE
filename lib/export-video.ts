import type { Scene } from '@/components/canvas/scene-timeline'
import type { ExportResult } from '@/lib/export-scenes'

const CORE_VERSION = '0.12.10'
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`

const OUTPUT_W = 1920
const OUTPUT_H = 1080
const FPS = 24
const IMAGE_HOLD_SECONDS = 3

const SCALE_FILTER =
  `scale=${OUTPUT_W}:${OUTPUT_H}:force_original_aspect_ratio=decrease,` +
  `pad=${OUTPUT_W}:${OUTPUT_H}:(ow-iw)/2:(oh-ih)/2:black,fps=${FPS},setsar=1,format=yuv420p`

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/?%*:|"<>]/g, '-').trim()
  return cleaned || 'Untitled'
}

function inferKind(url: string, hasVideo: boolean): 'video' | 'image' {
  try {
    const path = new URL(url, 'http://x.invalid').pathname.toLowerCase()
    if (/\.(mp4|webm|mov|m4v)$/.test(path)) return 'video'
    if (/\.(png|jpe?g|webp|gif)$/.test(path)) return 'image'
  } catch {
    // fall through
  }
  return hasVideo ? 'video' : 'image'
}

function sourceExt(url: string, kind: 'video' | 'image'): string {
  try {
    const path = new URL(url, 'http://x.invalid').pathname.toLowerCase()
    const m = path.match(/\.(png|jpe?g|webp|gif|mp4|webm|mov|m4v)$/)
    if (m) return m[1] === 'jpeg' ? 'jpg' : m[1]
  } catch {
    // fall through
  }
  return kind === 'video' ? 'mp4' : 'png'
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function blobDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video')
    el.preload = 'metadata'
    el.muted = true
    const url = URL.createObjectURL(blob)
    const done = (seconds: number) => {
      URL.revokeObjectURL(url)
      el.removeAttribute('src')
      el.load()
      resolve(seconds)
    }
    el.onloadedmetadata = () => {
      const d = el.duration
      if (Number.isFinite(d) && d > 0) done(d)
      else done(IMAGE_HOLD_SECONDS)
    }
    el.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read clip duration'))
    }
    el.src = url
  })
}

type FfmpegInstance = import('@ffmpeg/ffmpeg').FFmpeg

let ffmpegLoader: Promise<FfmpegInstance> | null = null

async function getFfmpeg(onProgress?: (message: string) => void): Promise<FfmpegInstance> {
  if (ffmpegLoader) return ffmpegLoader
  ffmpegLoader = (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ])
    const ffmpeg = new FFmpeg()
    onProgress?.('Loading FFmpeg in the browser…')
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    return ffmpeg
  })()
  try {
    return await ffmpegLoader
  } catch (err) {
    ffmpegLoader = null
    throw err
  }
}

async function writeInput(
  ffmpeg: FfmpegInstance,
  fetchFile: (data: string | File | Blob) => Promise<Uint8Array>,
  name: string,
  blob: Blob,
) {
  await ffmpeg.writeFile(name, await fetchFile(blob))
}

async function transcodeClip(
  ffmpeg: FfmpegInstance,
  src: string,
  dest: string,
  kind: 'video' | 'image',
  duration: number,
): Promise<void> {
  const t = Math.max(0.2, duration).toFixed(3)
  const videoIn = kind === 'image'
    ? ['-loop', '1', '-t', t, '-i', src]
    : ['-i', src]
  let withAudio = 1
  try {
    withAudio = await ffmpeg.exec([
      ...videoIn,
      '-vf', SCALE_FILTER,
      '-map', '0:v:0',
      '-map', '0:a:0',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-c:a', 'aac',
      '-ar', '48000',
      '-ac', '2',
      '-shortest',
      '-movflags', '+faststart',
      dest,
    ])
  } catch {
    withAudio = 1
  }
  if (withAudio === 0) return

  await ffmpeg.deleteFile(dest).catch(() => undefined)
  const silent = await ffmpeg.exec([
    ...videoIn,
    '-f', 'lavfi',
    '-t', t,
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-vf', SCALE_FILTER,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-shortest',
    '-movflags', '+faststart',
    dest,
  ])
  if (silent !== 0) {
    throw new Error(`FFmpeg could not normalize ${src}`)
  }
}

// Stitches tagged shots in scene order, then shot order, into one H.264 MP4.
// Runs entirely in the browser via ffmpeg.wasm (single-thread core — no
// SharedArrayBuffer / COOP headers, so Clerk keeps working).
export async function exportScenesAsVideo(
  scenes: Scene[],
  projectName: string,
  onProgress?: (message: string) => void,
): Promise<ExportResult> {
  const clips: { scene: string; order: number; url: string; kind: 'video' | 'image' }[] = []
  const skipped: ExportResult['skipped'] = []

  for (const scene of scenes) {
    const ordered = [...scene.shots].sort((a, b) => a.order - b.order)
    for (const shot of ordered) {
      if (!shot.nodeId) continue
      if (!shot.mediaUrl) {
        skipped.push({ scene: scene.name, order: shot.order, reason: 'no media URL yet' })
        continue
      }
      clips.push({
        scene: scene.name,
        order: shot.order,
        url: shot.mediaUrl,
        kind: inferKind(shot.mediaUrl, !!shot.hasVideo),
      })
    }
  }

  if (clips.length === 0) {
    throw new Error('Nothing to export — tag completed shots first.')
  }

  const ffmpeg = await getFfmpeg(onProgress)
  const { fetchFile } = await import('@ffmpeg/util')

  const listLines: string[] = []
  try {
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const src = `src-${String(i + 1).padStart(3, '0')}.${sourceExt(clip.url, clip.kind)}`
      const dest = `clip-${String(i + 1).padStart(3, '0')}.mp4`
      onProgress?.(`Fetching shot ${i + 1} of ${clips.length}…`)

      let blob: Blob
      try {
        const res = await fetch(clip.url)
        if (!res.ok) {
          skipped.push({ scene: clip.scene, order: clip.order, reason: `fetch ${res.status}` })
          continue
        }
        blob = await res.blob()
      } catch (err) {
        skipped.push({
          scene: clip.scene,
          order: clip.order,
          reason: err instanceof Error ? err.message : 'fetch failed',
        })
        continue
      }

      let duration = IMAGE_HOLD_SECONDS
      if (clip.kind === 'video') {
        try {
          duration = await blobDuration(blob)
        } catch {
          duration = IMAGE_HOLD_SECONDS
        }
      }

      onProgress?.(`Encoding shot ${i + 1} of ${clips.length}…`)
      await writeInput(ffmpeg, fetchFile, src, blob)
      try {
        await transcodeClip(ffmpeg, src, dest, clip.kind, duration)
        listLines.push(`file '${dest}'`)
      } finally {
        await ffmpeg.deleteFile(src).catch(() => undefined)
      }
    }

    if (listLines.length === 0) {
      throw new Error('Nothing to export — every shot failed to download.')
    }

    onProgress?.('Stitching shots…')
    await ffmpeg.writeFile('concat.txt', listLines.join('\n'))
    const concatCode = await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c', 'copy',
      'output.mp4',
    ])
    if (concatCode !== 0) {
      throw new Error('FFmpeg could not stitch the clips together.')
    }

    const data = await ffmpeg.readFile('output.mp4')
    const bytes = data instanceof Uint8Array
      ? new Uint8Array(data)
      : new TextEncoder().encode(String(data))
    const out = new Blob([bytes], { type: 'video/mp4' })
    downloadBlob(out, `${sanitizeFileName(projectName)}.mp4`)

    return { fileCount: listLines.length, skipped }
  } finally {
    const clipNames = listLines
      .map((line) => line.match(/'([^']+)'/)?.[1])
      .filter((name): name is string => !!name)
    const leftovers = ['concat.txt', 'output.mp4', ...clipNames]
    await Promise.all(leftovers.map((name) => ffmpeg.deleteFile(name).catch(() => undefined)))
  }
}
