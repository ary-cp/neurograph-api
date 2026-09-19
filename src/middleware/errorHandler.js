import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

export class AppError extends Error {
  constructor(status, message, options) {
    super(message, options)
    this.name = 'AppError'
    this.status = status
  }
}

export function notFound(req, res) {
  res.status(404).json({ ok: false, error: `Route ${req.method} ${req.path} not found` })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  const status = Number(err.status ?? err.statusCode ?? 500)
  const isServerError = status >= 500

  if (isServerError) logger.error(`${req.method} ${req.path} → ${status}`, err.stack ?? err, err.cause ?? '')

  res.status(status).json({
    ok: false,
    error: isServerError && env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(env.NODE_ENV !== 'production' && err.cause && { cause: String(err.cause?.message ?? err.cause) }),
  })
}
