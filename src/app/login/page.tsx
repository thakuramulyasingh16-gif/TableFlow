'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signIn, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Lock, UtensilsCrossed } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    // Establish tf_csrf cookie at login/session start
    void fetch('/api/csrf', { credentials: 'include' }).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await signIn('credentials', {
        email,
        password,
        totpCode: totpCode.trim() || undefined,
        redirect: false,
      });

      if (!res || res.error) {
        setError('Invalid credentials, invalid MFA code, or account locked.');
        return;
      }

      // Ensure fresh tf_csrf cookie is bound to session
      await fetch('/api/csrf', { credentials: 'include' }).catch(() => {});

      const session = await getSession();
      const user = session?.user as { role?: string; mustChangePassword?: boolean } | undefined;

      if (user?.mustChangePassword) {
        setCurrentPassword(password);
        setMustChangePassword(true);
        return;
      }

      const role = user?.role;
      if (role === 'chef') router.push('/kitchen');
      else if (role === 'owner' || role === 'manager') router.push('/admin');
      else router.push('/staff');
    } catch {
      setError('Sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPasswordSuccess('');

    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/staff/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Password change failed');
      }

      setPasswordSuccess('Password successfully updated! Redirecting...');
      setTimeout(async () => {
        const session = await getSession();
        const role = (session?.user as { role?: string } | undefined)?.role;
        if (role === 'chef') router.push('/kitchen');
        else if (role === 'owner' || role === 'manager') router.push('/admin');
        else router.push('/staff');
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password');
    } finally {
      setSubmitting(false);
    }
  }

  if (mustChangePassword) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-5">
        <Card className="w-full max-w-md overflow-hidden">
          <div className="bg-signature-gradient p-6">
            <h1 className="text-[22px] font-extrabold text-ink leading-tight">Change Password Required</h1>
            <p className="text-[13px] font-medium text-muted mt-1">
              Your account policy requires setting a new password (min 12 characters) before proceeding.
            </p>
          </div>

          <div className="p-6 space-y-4">
            {error && (
              <div role="alert" className="p-3 rounded-[12px] bg-tomato/10 border border-tomato text-tomato text-[13px] font-bold">
                {error}
              </div>
            )}
            {passwordSuccess && (
              <div role="status" className="p-3 rounded-[12px] bg-mint-bg border border-leaf text-leaf text-[13px] font-bold">
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-[13px] font-bold text-ink mb-1">
                  New Password (min 12 characters)
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 12 characters"
                  className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-[13px] font-bold text-ink mb-1">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-mint text-ink text-[14px]"
                />
              </div>

              <Button type="submit" variant="leaf" fullWidth disabled={submitting}>
                <Lock className="w-4 h-4" aria-hidden="true" />
                {submitting ? 'Updating Password...' : 'Save New Password & Continue'}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    );
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
            <div>
              <label htmlFor="login-totp" className="block text-[13px] font-bold text-ink mb-1">
                MFA / Authenticator Code (if enabled)
              </label>
              <input
                id="login-totp"
                type="text"
                autoComplete="one-time-code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="6-digit code or recovery code"
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
