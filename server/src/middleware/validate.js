import { AppError } from '../utils/AppError.js';

export function validate(schemas) {
  return function validateMiddleware(req, _res, next) {
    try {
      if (schemas.params) {
        const parsed = schemas.params.safeParse(req.params);
        if (!parsed.success) {
          throw new AppError(400, 'Invalid path parameters', 'VALIDATION_ERROR');
        }
        req.params = parsed.data;
      }

      if (schemas.query) {
        const parsed = schemas.query.safeParse(req.query);
        if (!parsed.success) {
          throw new AppError(400, 'Invalid query parameters', 'VALIDATION_ERROR');
        }
        req.query = parsed.data;
      }

      if (schemas.body) {
        const parsed = schemas.body.safeParse(req.body);
        if (!parsed.success) {
          const message = parsed.error.issues
            .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
            .slice(0, 3)
            .join('; ');
          throw new AppError(400, message || 'Invalid request payload', 'VALIDATION_ERROR');
        }
        req.body = parsed.data;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
