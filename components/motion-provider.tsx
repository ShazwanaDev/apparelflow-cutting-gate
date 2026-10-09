'use client';

import { MotionConfig } from 'motion/react';

/**
 * Honours the operating system's reduced-motion setting for every animation:
 * movement and layout animations are switched off, and fades remain.
 *
 * This is deliberately decided at animation time rather than by choosing
 * different starting styles during render. The server cannot know the
 * visitor's setting, so a render-time choice produces HTML that does not match
 * what the browser renders, and React leaves the mismatched styles in place.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
