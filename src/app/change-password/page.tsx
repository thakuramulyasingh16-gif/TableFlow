'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button, Card, PasswordField } from '@/components/ui';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [id, setId] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (mfaRequired && !totpCode.trim()) {
      setError('Please enter your authenticator code.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ success: boolean; message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: {
          id: id.trim(),
          currentPassword,
          newPassword,
          ...(totpCode.trim() ? { totpCode: totpCode.trim() } : {}),
        },
      });

      setSuccess(res.message || 'Password changed successfully!');
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: unknown) {
      const apiErr = err as { code?: string; message?: string };
      if (apiErr.code === 'MFA_REQUIRED') {
        setMfaRequired(true);
        setError('');
      } else {
        setError(apiErr.message || 'Unable to change password. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-mint-bg text-leaf mb-2 shadow-sm">
            <KeyRound className="w-8 h-8" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">Change Password</h1>
          <p className="text-[14px] font-bold text-muted">
            Enter your ID (email or username) and current password to set a new password.
          </p>
        </div>

        <Card className="p-6 sm:p-8 bg-surface shadow-card border border-leaf/10 rounded-2xl">
          {error && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-tomato/10 border border-tomato/30 text-tomato text-[13px] font-bold"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="mb-5 p-3.5 rounded-xl bg-leaf/10 border border-leaf/30 text-leaf text-[13px] font-bold flex items-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              <span>{success} Redirecting to login...</span>
            </div>
          )}

          {mfaRequired && !success && (
            <div className="mb-5 p-3.5 rounded-xl bg-mint-bg border border-leaf/30 text-leaf text-[13px] font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              <span>Two-factor authentication required for this account. Enter your code below.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="change-pass-id" className="block text-[13px] font-bold text-ink mb-1">
                ID (Email or Username)
              </label>
              <input
                id="change-pass-id"
                type="text"
                autoComplete="username"
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="name@tableflow.com or username"
                className="w-full min-h-[44px] px-3.5 rounded-[12px] bg-cream border border-leaf/20 text-ink text-[14px] font-bold focus:outline-none focus:ring-2 focus:ring-leaf/50"
              />
            </div>

            <PasswordField
              id="change-pass-current"
              label="Current Password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Your current password"
              autoComplete="current-password"
              required
            />

            <PasswordField
              id="change-pass-new"
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
              id="change-pass-confirm"
              label="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
            />

            {mfaRequired && (
              <div>
                <label htmlFor="change-pass-totp" className="block text-[13px] font-bold text-ink mb-1">
                  Authenticator Code
                </label>
                <input
                  id="change-pass-totp"
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
            )}

            <div className="pt-2">
              <Button
                type="submit"
                variant="leaf"
                disabled={submitting}
                className="w-full min-h-[46px] font-extrabold text-[15px]"
              >
                {submitting
                  ? 'Updating Password...'
                  : mfaRequired
                    ? 'Verify MFA & Update Password'
                    : 'Update Password'}
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-[14px] font-bold text-leaf hover:underline min-h-[44px] py-2"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Back to Login</span>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
