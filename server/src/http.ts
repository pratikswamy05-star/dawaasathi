import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Wrap async route handlers so thrown errors reach the error middleware (Express 4). */
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

/** Validate input with Zod; throws a 400 with field errors. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'Please check the highlighted fields', r.error.flatten().fieldErrors);
  return r.data;
}

export const idParam = (req: Request, name = 'id') => {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${name}`);
  return n;
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid input', details: err.flatten().fieldErrors });
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'Invalid JSON body' });
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large')
    return res.status(413).json({ error: 'That is too large to upload. Keep voice recordings under 30 seconds.' });
  console.error('[error]', err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
