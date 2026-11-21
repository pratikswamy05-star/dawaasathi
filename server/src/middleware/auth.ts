import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { config } from '../config';
import { one } from '../db';
import { HttpError } from '../http';
import type { AuthUser, Role } from '../services/access';

export function signToken(u: AuthUser) {
  return jwt.sign({ sub: String(u.id), role: u.role }, config.jwtSecret, { expiresIn: '12h' });
}

/** Verifies the JWT AND re-checks the user in the database (deactivated users are locked out immediately). */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new HttpError(401, 'Please log in'));
  let userId: number;
  try {
    const payload = jwt.verify(h.slice(7), config.jwtSecret) as JwtPayload;
    userId = Number(payload.sub);
  } catch {
    return next(new HttpError(401, 'Your session has expired. Please log in again.'));
  }
  one<{ id: number; role: Role; name: string; active: boolean }>('select id, role, name, active from users where id = $1', [userId])
    .then((u) => {
      if (!u || !u.active) return next(new HttpError(401, 'Your account is not active'));
      req.user = { id: u.id, role: u.role, name: u.name };
      next();
    })
    .catch(next);
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) =>
    req.user && roles.includes(req.user.role) ? next() : next(new HttpError(403, 'This action is not allowed for your role'));
