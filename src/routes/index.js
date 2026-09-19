import { Router } from 'express'
import { env } from '../config/env.js'
import graphRoutes from './graph.routes.js'

const router = Router()

router.get('/health', (_req, res) =>
  res.json({
    ok: true,
    service: 'neurograph-server',
    model: env.MOCK_LLM ? 'mock' : env.GROQ_MODEL,
    whisper: env.MOCK_LLM ? 'mock' : env.GROQ_WHISPER_MODEL,
    supabase: Boolean(env.SUPABASE_URL),
    research: env.RESEARCH_ENABLED,
    uptime: Math.round(process.uptime()),
  }),
)

router.use(graphRoutes) // → /api/extract-graph

export default router
