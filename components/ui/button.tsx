import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'md' | 'lg' | 'sm';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out-soft)] ' +
  'active:scale-[0.98] disabled:active:scale-100 cursor-pointer disabled:cursor-not-allowed ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink touch-manipulation';

// Disabled buttons keep readable text (muted on a light fill is 4.96:1) so the
// person can still read what they cannot do yet; the reason is shown nearby.
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-[#3a2f32] disabled:bg-disabled disabled:text-muted disabled:border disabled:border-line',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-ink hover:bg-sunken disabled:bg-disabled disabled:text-muted disabled:border-line',
  ghost: 'text-ink hover:bg-blush-tint disabled:text-muted',
  danger: 'bg-surface text-shortage border border-shortage hover:bg-shortage-tint disabled:text-muted disabled:border-line',
  accent: 'bg-coral text-ink hover:bg-blush disabled:bg-disabled disabled:text-muted',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3.5 text-sm',
  md: 'min-h-11 px-5 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading = false, icon, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className = '',
  icon,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
