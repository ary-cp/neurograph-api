const reject = (res, where, error) =>
  res.status(400).json({
    ok: false,
    error: `Invalid request ${where}`,
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  })

/** Validates req.body against a zod schema; parsed/defaulted data lands on req.validated. */
export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {})
  if (!result.success) return reject(res, 'body', result.error)
  req.validated = result.data
  next()
}

/** Validates req.params → req.validatedParams. */
export const validateParams = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.params ?? {})
  if (!result.success) return reject(res, 'params', result.error)
  req.validatedParams = result.data
  next()
}

/** Validates req.query → req.validatedQuery (req.query itself is read-only in Express 5). */
export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query ?? {})
  if (!result.success) return reject(res, 'query', result.error)
  req.validatedQuery = result.data
  next()
}
