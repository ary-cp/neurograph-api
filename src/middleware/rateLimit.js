import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'

/** Groq quota is the scarce resource in a hackathon — throttle only the AI endpoints. */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.RATE_LIMIT_PER_MIN,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests — slow down.' },
})
