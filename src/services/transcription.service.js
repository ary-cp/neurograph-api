import fs from 'node:fs'
import { groq } from '../config/groq.js'
import { env } from '../config/env.js'
import { AppError } from '../middleware/errorHandler.js'

/**
 * Audio file on disk → { text, meta } via Groq Whisper.
 * `language` (ISO-639-1, e.g. "hi", "en") and `prompt` (vocabulary hints) are optional but improve accuracy.
 */
export async function transcribeAudio({ filePath, language, prompt }) {
  if (env.MOCK_LLM) {
    return {
      text: 'This is a mock transcript. Set MOCK_LLM=false with a GROQ_API_KEY to transcribe real audio.',
      meta: { model: 'mock', language: language ?? 'en', duration: 0, latencyMs: 0, mock: true },
    }
  }

  const started = Date.now()
  let result
  try {
    result = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath), // filename keeps its extension → Whisper can sniff the container
      model: env.GROQ_WHISPER_MODEL,
      response_format: 'verbose_json', // also gives us language + duration
      temperature: 0,
      ...(language && { language }),
      ...(prompt && { prompt }),
    })
  } catch (err) {
    if (err?.status === 429) throw new AppError(429, 'Groq rate limit hit — retry in a few seconds', { cause: err })
    if (err?.status === 413) throw new AppError(413, 'Audio too large for Groq (25 MB on the free tier)', { cause: err })
    if (err?.status >= 400 && err?.status < 500) throw new AppError(502, `Groq rejected the audio: ${err.message}`, { cause: err })
    throw new AppError(503, 'Groq is unreachable right now', { cause: err })
  }

  const text = String(result?.text ?? '').trim()
  if (!text) throw new AppError(422, 'No speech detected in the recording')

  return {
    text,
    meta: {
      model: env.GROQ_WHISPER_MODEL,
      language: result.language ?? language ?? null,
      duration: typeof result.duration === 'number' ? Math.round(result.duration * 10) / 10 : null,
      latencyMs: Date.now() - started,
      mock: false,
    },
  }
}
