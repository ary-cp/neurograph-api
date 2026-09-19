import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { env, corsOrigins } from './src/config/env.js'
import apiRoutes from './src/routes/index.js'
import { notFound, errorHandler } from './src/middleware/errorHandler.js'
import { logger } from './src/utils/logger.js'

const app = express()

// ── Security & parsing ──────────────────────────────────────────────
app.disable('x-powered-by')
app.set('trust proxy', 1) // correct client IPs behind Render / Railway / Fly
app.use(helmet())
app.use(
  cors({
    origin: (origin, cb) => cb(null, true), // Dynamically allow any origin (fixes Vercel preview URLs)
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// ── Routes ──────────────────────────────────────────────────────────
app.use('/api', apiRoutes)
app.use(notFound)
app.use(errorHandler)

// ── Boot ────────────────────────────────────────────────────────────
const server = app.listen(env.PORT, () => {
  logger.info(`NeuroGraph brain online → http://localhost:${env.PORT}`)
  logger.info(`CORS origins   : ${corsOrigins.join(', ')}`)
  logger.info(`LLM            : ${env.MOCK_LLM ? 'MOCK (no Groq calls)' : env.GROQ_MODEL}`)
  logger.info(`Supabase       : ${env.SUPABASE_URL ? 'configured' : 'not configured (persist disabled)'}`)
  logger.info(
    `Web research   : ${env.RESEARCH_ENABLED ? `Jina Reader (${env.JINA_API_KEY ? 'API key' : 'anonymous, ~20 req/min'}, ≤${env.RESEARCH_MAX_URLS} links, ≤${env.RESEARCH_MAX_CHARS} chars each)` : 'disabled'}`,
  )
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    logger.info(`${sig} received — shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 5000).unref()
  })
}
