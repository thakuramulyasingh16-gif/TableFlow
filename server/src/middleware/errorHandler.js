import { AppError } from '../utils/AppError.js';
import { logger } from '../config/logger.js';

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'Resource not found', 'NOT_FOUND'));
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.originalUrl, method: req.method }, 'Operational server error');
    }
    const body = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if (err.details) {
      body.error.details = err.details;
    }
    return res.status(err.statusCode).json(body);
  }

  if (err?.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: {
        code: 'DUPLICATE_RECORD',
        message: 'A record with the same unique value already exists.',
      },
    });
  }

  if (err?.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      error: {
        code: 'INVALID_REFERENCE',
        message: 'Referenced record does not exist or cannot be modified.',
      },
    });
  }

  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'Uploaded file exceeds maximum allowed size of 2MB.',
      },
    });
  }

  logger.error({ err, path: req.originalUrl, method: req.method }, 'Unhandled server error');
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again.',
    },
  });
}
