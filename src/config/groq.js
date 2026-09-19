import Groq from 'groq-sdk'
import { env } from './env.js'

/** Singleton Groq client — null when running in MOCK_LLM mode. */
export const groq = env.GROQ_API_KEY ? new Groq({ apiKey: env.GROQ_API_KEY, maxRetries: 1, timeout: 30_000 }) : null
