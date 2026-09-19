import { Router } from 'express'
import { extractGraphHandler, getRoomHandler, transcribeHandler } from '../controllers/graph.controller.js'
import { validate } from '../middleware/validate.js'
import { aiLimiter } from '../middleware/rateLimit.js'
import { uploadAudio } from '../middleware/upload.js'
import { extractRequestSchema, roomParamsSchema } from '../schemas/graph.schema.js'

const router = Router()

router.post('/extract-graph', aiLimiter, validate(extractRequestSchema), extractGraphHandler)
router.get('/room/:roomId', getRoomHandler)
router.post('/transcribe', aiLimiter, uploadAudio, transcribeHandler) // Voice-to-Graph: audio → Whisper → text

export default router
