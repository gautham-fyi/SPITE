const TEXT_EXTS = [
  '.md',
  '.markdown',
  '.txt',
  '.csv',
  '.tsv',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.css',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
]

export function inferMediaType(filename?: string, fallback = 'application/octet-stream') {
  const name = (filename || '').toLowerCase()
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'text/markdown'
  if (name.endsWith('.txt')) return 'text/plain'
  if (name.endsWith('.csv')) return 'text/csv'
  if (name.endsWith('.tsv')) return 'text/tab-separated-values'
  if (name.endsWith('.json')) return 'application/json'
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'text/yaml'
  if (name.endsWith('.xml')) return 'application/xml'
  if (name.endsWith('.html')) return 'text/html'
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.mp4')) return 'video/mp4'
  if (name.endsWith('.webm')) return 'video/webm'
  if (name.endsWith('.mp3')) return 'audio/mpeg'
  if (name.endsWith('.wav')) return 'audio/wav'
  return fallback
}

export function attachmentMediaType(file: { name?: string; type?: string }) {
  if (file.type) return file.type
  return inferMediaType(file.name)
}

export function isTextAttachment(file: { name?: string; mediaType?: string; type?: string }) {
  const type = (file.mediaType || file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  if (type.startsWith('text/')) return true
  if (type === 'application/json' || type === 'application/xml' || type.includes('markdown')) return true
  return TEXT_EXTS.some((ext) => name.endsWith(ext))
}
