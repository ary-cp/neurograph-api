import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import { AppError } from './errorHandler.js'

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // Groq's per-file limit on the free tier (100 MB on dev tier)

// Whisper sniffs the container from the file extension. Browser MediaRecorder blobs usually arrive
// as "blob" with no extension, so we derive one from the MIME type.
const EXT_BY_MIME = {
  'audio/webm': '.webm', 'video/webm': '.webm',
  'audio/ogg': '.ogg', 'audio/opus': '.opus',
  'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/m4a': '.m4a', 'video/mp4': '.mp4',
  'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mpga': '.mpga',
  'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav', 'audio/vnd.wave': '.wav',
  'audio/flac': '.flac', 'audio/x-flac': '.flac',
  'audio/aac': '.aac',
}
const ALLOWED_EXT = new Set(['.webm', '.ogg', '.opus', '.m4a', '.mp4', '.mp3', '.mpeg', '.mpga', '.wav', '.flac', '.aac'])

/** → ".webm" | ".wav" | … | null when the upload is not a supported audio type. */
export function audioExtension({ originalname = '', mimetype = '' } = {}) {
  const fromName = path.extname(originalname).toLowerCase()
  if (ALLOWED_EXT.has(fromName)) return fromName
  const mime = mimetype.split(';')[0].trim().toLowerCase()
  return EXT_BY_MIME[mime] ?? null
}

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (_req, file, cb) => cb(null, `neurograph-${crypto.randomUUID()}${audioExtension(file) ?? '.bin'}`),
})

const single = multer({
  storage,
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) =>
    audioExtension(file)
      ? cb(null, true)
      : cb(new AppError(415, `Unsupported audio type "${file.mimetype}" — send webm, ogg, m4a/mp4, mp3, wav or flac`)),
}).single('audio')

/** `upload.single('audio')` with multer's own errors translated into our JSON error shape. */
export function uploadAudio(req, res, next) {
  single(req, res, (err) => {
    if (!err) return next()
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, `Audio must be ≤ ${MAX_AUDIO_BYTES / 1024 / 1024} MB`, { cause: err }))
      if (err.code === 'LIMIT_UNEXPECTED_FILE') return next(new AppError(400, 'Send the recording as a multipart field named "audio"', { cause: err }))
      return next(new AppError(400, err.message, { cause: err }))
    }
    next(err)
  })
}
