'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Eye, EyeOff, Scissors, ScanLine, Shirt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { signInAs } from '@/components/shell/role-switcher';
import { api } from '@/lib/client/api';
import { DEMO_ACCOUNTS, DEMO_MODE } from '@/lib/demo-accounts';
import { ROLE_LABELS, type Role } from '@/lib/domain/constants';
import { loginSchema } from '@/lib/validation';

const ROLE_ICON: Record<Role, typeof Scissors> = {
  cutting_supervisor: Scissors,
  cutting_verifier: ScanLine,
  sewing_supervisor: Shirt,
};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState<'form' | Role | null>(null);

  function fieldError(name: 'email' | 'password', value: string) {
    const result = loginSchema.shape[name].safeParse(value);
    return result.success ? undefined : result.error.issues[0]?.message;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = { email: fieldError('email', email), password: fieldError('password', password) };
    setErrors(next);
    if (next.email || next.password) {
      document.getElementById(next.email ? 'email' : 'password')?.focus();
      return;
    }
    setBusy('form');
    const result = await api<{ redirectTo: string }>('/api/auth/login', { method: 'POST', body: { email, password } });
    if (!result.ok) {
      setBusy(null);
      setErrors({ form: result.error.message });
      return;
    }
    router.push(result.data.redirectTo);
    router.refresh();
  }

  async function quickSignIn(role: Role) {
    const account = DEMO_ACCOUNTS.find(entry => entry.role === role)!;
    setBusy(role);
    setErrors({});
    const result = await signInAs(account.email, account.password);
    if (!result.ok) {
      setBusy(null);
      setErrors({ form: result.error.message });
      return;
    }
    router.push(result.data.redirectTo);
    router.refresh();
  }

  return (
    <div className="w-full max-w-md">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-describedby={errors.form ? 'form-error' : undefined}>
        <Field id="email" label="Work email" error={errors.email} required>
          {props => (
            <input
              {...props}
              type="email"
              autoComplete="username"
              inputMode="email"
              spellCheck={false}
              placeholder="name@apparelflow.demo"
              value={email}
              onChange={event => setEmail(event.target.value)}
              onBlur={() => email && setErrors(current => ({ ...current, email: fieldError('email', email) }))}
              className="field-control"
            />
          )}
        </Field>
        <Field id="password" label="Password" error={errors.password} required>
          {props => (
            <div className="relative">
              <input
                {...props}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="field-control pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 grid w-11 cursor-pointer place-items-center rounded-r-[8px] text-muted hover:text-ink"
              >
                {showPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
              </button>
            </div>
          )}
        </Field>

        {errors.form && (
          <p id="form-error" role="alert" className="rounded-[8px] border border-shortage-line bg-shortage-tint px-3 py-2 text-sm font-medium text-shortage">
            {errors.form}
          </p>
        )}

        <Button type="submit" size="lg" loading={busy === 'form'} disabled={busy !== null} className="w-full">
          Sign in <ArrowRight aria-hidden className="size-4" />
        </Button>
      </form>

      {DEMO_MODE && (
        <section aria-labelledby="demo-heading" className="mt-10">
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-6">
            <h2 id="demo-heading" className="label-caps text-ink">
              Demo accounts
            </h2>
            <p className="text-xs text-muted">One click signs in as that role</p>
          </div>
          <ul className="mt-4 grid gap-2">
            {DEMO_ACCOUNTS.map((account, index) => {
              const Icon = ROLE_ICON[account.role];
              return (
                <motion.li
                  key={account.role}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.15 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
                >
                  <button
                    type="button"
                    onClick={() => quickSignIn(account.role)}
                    disabled={busy !== null}
                    className="group flex w-full cursor-pointer items-start gap-3 rounded-[12px] border border-line bg-surface p-3 text-left transition-colors duration-150 hover:border-ink hover:bg-blush-tint disabled:cursor-wait disabled:opacity-70"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mint text-ink">
                      <Icon aria-hidden className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-ink">{account.fullName}</span>
                        <span className="text-xs text-muted">{ROLE_LABELS[account.role]}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{account.summary}</span>
                      <span className="mt-1 block font-mono text-xs break-all text-muted">
                        {account.email} · {account.password}
                      </span>
                    </span>
                    <span className="self-center text-sm font-medium text-ink">
                      {busy === account.role ? 'Signing in…' : <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />}
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
