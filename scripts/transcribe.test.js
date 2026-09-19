// node --test — upload helpers for /api/transcribe (no network)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audioExtension, MAX_AUDIO_BYTES } from '../src/middleware/upload.js'

test('audioExtension: filename wins, MIME fallback for MediaRecorder blobs, unsupported → null', () => {
  assert.equal(audioExtension({ originalname: 'memo.MP3', mimetype: 'application/octet-stream' }), '.mp3')
  assert.equal(audioExtension({ originalname: 'blob', mimetype: 'audio/webm;codecs=opus' }), '.webm')
  assert.equal(audioExtension({ originalname: '', mimetype: 'audio/mp4' }), '.m4a')
  assert.equal(audioExtension({ originalname: 'recording', mimetype: 'audio/x-wav' }), '.wav')
  assert.equal(audioExtension({ originalname: 'notes.txt', mimetype: 'text/plain' }), null)
  assert.equal(audioExtension({}), null)
  assert.equal(MAX_AUDIO_BYTES, 25 * 1024 * 1024)
})
