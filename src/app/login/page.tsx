'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Lock, UtensilsCrossed } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (!res || res.error) {
        setError('Invalid credentials or account temporarily locked.');
        return;
      }

      const session = await getSession();
      const role = (session?.user as { role?: string } | undefined)?.role;
      if (role === 'chef') router.push('/kitchen');
      else if (role === 'owner' || role === 'manager') router.push('/admin');
      else router.push('/staff');
    } catch {
      setError('Sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-5">
      <Card className="w-full max-w-md overflow-hidden">
        <div className="bg-signature-gradient p-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-[14px] bg-leaf text-surface flex items-center justify-center">
            <UtensilsCrossed className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-[24px] font-extrabold text-ink leading-tight">Staff Sign In</h1>
            <p className="text-[12px] font-bold text-leaf">Waiter · Chef · Manager · Owner</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-[12px] bg-tomato/10 border border-tomato text-tomato text-[13px] font-bold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-[13px] font-bold text-ink mb-1">
                Work Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@tableflow.local"
                className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-[13px] font-bold text-ink mb-1">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
              />
            </div>
            <Button type="submit" variant="leaf" fullWidth disabled={submitting}>
              <Lock className="w-4 h-4" aria-hidden="true" />
              {submitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-[12px] text-muted">
            <Link href="/" className="underline font-bold text-leaf">
              Back to TableFlow Home
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
