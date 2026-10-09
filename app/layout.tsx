import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'ApparelFlow · Cutting Gate', template: '%s · ApparelFlow' },
  description: 'Cutting operations and gatekeeper verification for the ApparelFlow ERP.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fff9f8',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          closeButton
          duration={4000}
          toastOptions={{
            classNames: {
              toast: '!bg-surface !text-ink !border !border-line !shadow-[var(--shadow-floating)] !rounded-[12px] !font-sans',
              description: '!text-muted',
              closeButton: '!bg-surface !text-ink !border-line',
              success: '[&_[data-icon]]:!text-match',
              error: '[&_[data-icon]]:!text-shortage',
            },
          }}
        />
      </body>
    </html>
  );
}
