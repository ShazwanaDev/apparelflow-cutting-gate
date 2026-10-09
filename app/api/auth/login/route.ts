import bcrypt from 'bcryptjs';
import { DomainError } from '@/lib/domain/errors';
import { HOME_BY_ROLE } from '@/lib/domain/permissions';
import type { Role } from '@/lib/domain/constants';
import { getDb } from '@/lib/server/db';
import { json, publicHandler, readJson } from '@/lib/server/http';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/server/session';
import { issuesOf, loginSchema } from '@/lib/validation';

// Compared against when the email is unknown, so a wrong email takes as long to
// answer as a wrong password and response timing does not reveal which accounts
// exist. Generated at startup so it is a genuine hash with the real cost factor.
const DUMMY_HASH = bcrypt.hashSync('no-account-has-this-password', 10);

export const POST = publicHandler(
  async ({ request }) => {
    const parsed = loginSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new DomainError('VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Invalid sign-in', {
        issues: issuesOf(parsed.error),
      });
    }
    const { email, password } = parsed.data;
    const { rows } = await getDb().query<{ id: number; password_hash: string; role: Role; full_name: string }>(
      'SELECT id, password_hash, role, full_name FROM users WHERE email = $1',
      [email],
    );
    const user = rows[0];
    const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !valid) throw new DomainError('UNAUTHENTICATED', 'That email and password do not match.');

    const response = json({
      user: { id: user.id, fullName: user.full_name, role: user.role },
      redirectTo: HOME_BY_ROLE[user.role],
    });
    response.cookies.set(SESSION_COOKIE, await signSession(user.id), sessionCookieOptions());
    return response;
  },
);
