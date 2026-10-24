import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type AppRole } from '../context/AuthContext';

/**
 * Shared guard for role-restricted routes (admin, POS). Shows `pending` until both the
 * auth session and the Firestore-backed role have resolved, and only then decides — so
 * refreshing or deep-linking as a cashier / profile-admin isn't bounced to /login on the
 * provisional 'customer' role.
 */
const RoleGate: React.FC<{
  allow: readonly AppRole[];
  pending: React.ReactNode;
  children: React.ReactNode;
}> = ({ allow, pending, children }) => {
  const { user, role, loading, roleResolving } = useAuth();
  if (loading || roleResolving) return <>{pending}</>;
  if (!user || role === null || !allow.includes(role)) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export default RoleGate;
