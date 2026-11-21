import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import type { Role } from '../types';

export const HOME: Record<Role, string> = {
  patient: '/patient/dashboard',
  caregiver: '/caregiver/dashboard',
  asha: '/asha/dashboard',
  doctor: '/doctor/dashboard',
  admin: '/admin/dashboard',
};

/** Not logged in → /login. Wrong role → your own home. (The API enforces the same rules server-side.) */
export default function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { token, user } = useAuth();
  const loc = useLocation();
  if (!token || !user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return <>{children}</>;
}
