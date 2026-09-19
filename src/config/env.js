import 'dotenv/config'
import { z } from 'zod'

const bool = (fallback) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === '' ? fallback : ['1', 'true', 'yes'].includes(v.toLowerCase())))

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_WHISPER_MODEL: z.string().default('whisper-large-v3'), // or whisper-large-v3-turbo (faster, cheaper)
  MOCK_LLM: bool(false),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  // Live Web Research (Jina Reader). Key is optional — anonymous calls are limited to ~20/min.
  JINA_API_KEY: z.string().optional(),
  RESEARCH_ENABLED: bool(true),
  RESEARCH_MAX_URLS: z.coerce.number().int().min(0).max(5).default(2),
  RESEARCH_MAX_CHARS: z.coerce.number().int().min(500).max(60_000).default(8000), // per page; ~2k tokens
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('✖ Invalid environment configuration:')
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
  process.exit(1)
}

export const env = parsed.data

if (!env.MOCK_LLM && !env.GROQ_API_KEY) {
  console.error('✖ GROQ_API_KEY is missing. Add it to .env (or set MOCK_LLM=true to run without the LLM).')
  process.exit(1)
}

export const corsOrigins = env.CLIENT_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
