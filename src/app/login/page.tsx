'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Lock, ShieldCheck, UtensilsCrossed } from 'lucide-react';
import { apiFetch, ensureCsrfToken } from '@/lib/api-client';
import { Button, Card, PasswordField } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Forced password change flow if account flagged mustChangePassword
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  useEffect(() => {
    // Establish tf_csrf cookie at login/session start
    void ensureCsrfToken();
  }, []);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await signIn('credentials', {
        id: id.trim(),
        password,
        redirect: false,
      });

      if (res?.code === 'mfa_required' || res?.error === 'mfa_required') {
        void ensureCsrfToken();
        setStep('mfa');
        setTotpCode('');
        setError('');
        return;
      }

      if (!res || res.error) {
        setError('Invalid ID or password.');
        return;
      }

      // Re-issue fresh CSRF token bound to the logged-in session
      await ensureCsrfToken(true);
      await handlePostLoginSuccess();
    } catch {
      setError('Invalid ID or password.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await signIn('credentials', {
        id: id.trim(),
        password,
        totpCode: totpCode.trim(),
        redirect: false,
      });

      if (!res || res.error) {
        setError('Invalid authenticator code. Please try again.');
        return;
      }

      await ensureCsrfToken(true);
      await handlePostLoginSuccess();
    } catch {
      setError('Invalid authenticator code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePostLoginSuccess() {
    const session = await getSession();
    const user = session?.user as { role?: string; mustChangePassword?: boolean } | undefined;

    if (user?.mustChangePassword) {
      setCurrentPassword(password);
      setMustChangePassword(true);
      // Ensure CSRF token is fresh and ready for the forced password change form
      await ensureCsrfToken(true);
      return;
    }

    const role = user?.role;
    if (role === 'chef') router.push('/kitchen');
    else if (role === 'owner' || role === 'manager') router.push('/admin');
    else router.push('/staff');
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setPasswordSuccess('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ success: boolean; message?: string }>(
        '/api/staff/auth/change-password',
        {
          method: 'POST',
          body: {
            currentPassword,
            newPassword,
          },
        }
      );

      setPasswordSuccess(res.message || 'Password successfully updated! Redirecting...');
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
      <div className="min-h-screen bg-cream flex items-center justify-center p-5 font-sans">
        <Card className="w-full max-w-md overflow-hidden bg-surface shadow-card rounded-2xl border border-leaf/10">
          <div className="bg-signature-gradient p-6 flex items-center gap-3">
            <div className="w-11 h-11 rounded-[14px] bg-sun text-ink flex items-center justify-center">
              <KeyRound className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-[22px] font-extrabold text-ink leading-tight">Change Password Required</h1>
              <p className="text-[12px] font-bold text-leaf">Initial Login or Administrative Reset</p>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-[13px] text-muted font-bold">
              Your account policy requires setting a new password (min 8 characters) before proceeding.
            </p>

            {error && (
              <div role="alert" className="p-3 rounded-[12px] bg-tomato/10 border border-tomato text-tomato text-[13px] font-bold">
                {error}
              </div>
            )}

            {passwordSuccess && (
              <div role="status" className="p-3 rounded-[12px] bg-leaf/10 border border-leaf text-leaf text-[13px] font-bold">
                {passwordSuccess}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <PasswordField
                id="force-new-password"
                label="New Password (min 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />

              <PasswordField
                id="force-confirm-password"
                label="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />

              <Button type="submit" variant="leaf" fullWidth disabled={submitting} className="min-h-[46px] font-extrabold">
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
    <div className="min-h-screen bg-cream flex items-center justify-center p-5 font-sans">
      <Card className="w-full max-w-md overflow-hidden bg-surface shadow-card rounded-2xl border border-leaf/10">
        <div className="bg-signature-gradient p-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-[14px] bg-leaf text-surface flex items-center justify-center shadow-sm">
            <UtensilsCrossed className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-[24px] font-extrabold text-ink leading-tight">Staff Sign In</h1>
            <p className="text-[12px] font-bold text-leaf">Waiter · Chef · Manager · Owner</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3.5 rounded-[12px] bg-tomato/10 border border-tomato/30 text-tomato text-[13px] font-bold">
              {error}
            </div>
          )}

          {step === 'credentials' ? (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-id" className="block text-[13px] font-bold text-ink mb-1">
                  ID
                </label>
                <input
                  id="login-id"
                  name="id"
                  type="text"
                  required
                  autoComplete="username"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="Email or username"
                  className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold focus:outline-none focus:ring-2 focus:ring-leaf/50"
                />
              </div>

              <PasswordField
                id="login-password"
                name="password"
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />

              <Button type="submit" variant="leaf" fullWidth disabled={submitting} className="min-h-[46px] font-extrabold text-[15px]">
                <Lock className="w-4 h-4" aria-hidden="true" />
                {submitting ? 'Signing in...' : 'Sign In'}
              </Button>

              <div className="flex items-center justify-between pt-1">
                <Link
                  href="/change-password"
                  className="text-[13px] font-bold text-leaf hover:underline min-h-[44px] inline-flex items-center py-2"
                >
                  Change password
                </Link>
                <Link
                  href="/"
                  className="text-[13px] font-bold text-muted hover:text-ink hover:underline min-h-[44px] inline-flex items-center py-2"
                >
                  Home
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-mint-bg text-leaf">
                <ShieldCheck className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                <span className="text-[13px] font-bold">Two-factor authentication required for this account.</span>
              </div>

              <div>
                <label htmlFor="login-totp" className="block text-[13px] font-bold text-ink mb-1">
                  Authenticator Code
                </label>
                <input
                  id="login-totp"
                  name="totpCode"
                  type="text"
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="6-digit code or recovery code"
                  className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-leaf/50"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline-tomato"
                  onClick={() => {
                    setStep('credentials');
                    setTotpCode('');
                    setError('');
                  }}
                  disabled={submitting}
                  className="min-h-[46px] px-4 font-bold"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" /> Back
                </Button>
                <Button
                  type="submit"
                  variant="leaf"
                  disabled={submitting}
                  className="flex-1 min-h-[46px] font-extrabold text-[15px]"
                >
                  {submitting ? 'Verifying...' : 'Verify & Continue'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
