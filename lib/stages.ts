import type { Role } from './domain/constants';

// Kept out of the client components on purpose: a server component that
// imports a plain object from a 'use client' file receives a reference to it,
// not the object itself, so lookups on it silently come back undefined.

export const STAGES = ['Cutting', 'Verification', 'Sewing'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_BY_ROLE: Record<Role, Stage> = {
  cutting_supervisor: 'Cutting',
  cutting_verifier: 'Verification',
  sewing_supervisor: 'Sewing',
};
