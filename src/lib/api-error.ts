import { NextResponse } from 'next/server';

export class AppError extends Error {
  statusCode: number;
  code: string;
  details: Record<string, unknown> | null;

  constructor(
    statusCode: number,
    message: string,
    code = 'APP_ERROR',
    details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      console.error('[TableFlow Error]', { code: err.code, message: err.message });
    }
    const body: { error: { code: string; message: string; details?: Record<string, unknown> } } = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if (err.details) body.error.details = err.details;
    return NextResponse.json(body, { status: err.statusCode });
  }

  const prismaErr = err as { code?: string };
  if (prismaErr?.code === 'P2002') {
    return NextResponse.json(
      { error: { code: 'DUPLICATE_RECORD', message: 'A record with the same unique value already exists.' } },
      { status: 409 }
    );
  }
  if (prismaErr?.code === 'P2003' || prismaErr?.code === 'P2025') {
    return NextResponse.json(
      { error: { code: 'INVALID_REFERENCE', message: 'Referenced record was not found or cannot be modified.' } },
      { status: 400 }
    );
  }

  console.error('[TableFlow Unhandled Error]', err instanceof Error ? err.message : 'Unknown error');
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred. Please try again.' } },
    { status: 500 }
  );
}
