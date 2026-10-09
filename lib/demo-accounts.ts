import type { Role } from './domain/constants';

/**
 * The three public demo accounts shown on the sign-in screen and in the role
 * switcher. They are deliberately public so an evaluator can try each role;
 * a real deployment would remove this file and seed real users instead.
 */
export const DEMO_ACCOUNTS: Array<{ email: string; password: string; role: Role; fullName: string; summary: string }> = [
  {
    email: 'supervisor@apparelflow.demo',
    password: 'Supervisor123!',
    role: 'cutting_supervisor',
    fullName: 'Maya Perera',
    summary: 'Creates cutting orders, logs fabric, re-cuts rejected batches.',
  },
  {
    email: 'verifier@apparelflow.demo',
    password: 'Verifier123!',
    role: 'cutting_verifier',
    fullName: 'Nilan Fernando',
    summary: 'Counts every component and approves or rejects the batch.',
  },
  {
    email: 'sewing@apparelflow.demo',
    password: 'Sewing123!',
    role: 'sewing_supervisor',
    fullName: 'Asha Silva',
    summary: 'Receives verified batches only and starts sewing assembly.',
  },
];
