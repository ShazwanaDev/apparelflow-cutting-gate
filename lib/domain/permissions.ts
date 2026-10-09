import type { Role } from './constants';

/**
 * Who may do what. Every service function checks this map before touching data,
 * so the rule holds however the request arrives: a button, cURL, or a script.
 *
 * Separation of duties is deliberate. The person who cuts a batch can never be
 * the person who signs it off, and the sewing floor only ever reads batches that
 * have already been signed off.
 */
const CAPABILITIES = {
  'recipe:read': ['cutting_supervisor', 'cutting_verifier', 'sewing_supervisor'],
  'order:list': ['cutting_supervisor', 'cutting_verifier'],
  'order:read': ['cutting_supervisor', 'cutting_verifier'],
  'order:create': ['cutting_supervisor'],
  'order:submit': ['cutting_supervisor'],
  'order:count': ['cutting_verifier'],
  'order:approve': ['cutting_verifier'],
  'order:reject': ['cutting_verifier'],
  'sewing:read': ['sewing_supervisor'],
  'sewing:start': ['sewing_supervisor'],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

/** Where each role lands after signing in. */
export const HOME_BY_ROLE: Record<Role, string> = {
  cutting_supervisor: '/orders',
  cutting_verifier: '/verify',
  sewing_supervisor: '/sewing',
};
