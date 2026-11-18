'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { KeyRound, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';

export default function ChangePasswordPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password cannot be the same as your current password.');
      return;
    }

    setLoading(true);
    try {
      await apiFetch<{ success: boolean; message: string }>('/api/staff/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });

      setSuccess('Password updated successfully! Redirecting...');
      await update({ mustChangePassword: false });

      setTimeout(() => {
        const user = session?.user as { role?: string; mfaSetupRequired?: boolean } | undefined;
        if (user?.mfaSetupRequired) {
          router.push('/mfa-setup');
        } else {
          const role = user?.role;
          if (role === 'owner' || role === 'manager') {
            router.push('/admin');
          } else if (role === 'chef') {
            router.push('/kitchen');
          } else {
            router.push('/staff');
          }
        }
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <Card className="w-full max-w-md overflow-hidden shadow-card">
        <div className="bg-signature-gradient p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-leaf/10 flex items-center justify-center text-leaf font-bold">
                <KeyRound className="w-6 h-6 text-leaf" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-ink leading-tight">Change Password</h1>
                <p className="text-xs font-semibold text-muted">Account policy requires a password update</p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-1.5 text-xs font-bold text-muted hover:text-tomato transition-colors px-2 py-1 rounded-lg border border-leaf/15 hover:border-tomato/30"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-tomato/10 border border-tomato/30 text-tomato text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-mint-bg border border-leaf/30 text-leaf text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="current-pw" className="block text-xs font-bold text-ink mb-1">
                Current Password
              </label>
              <input
                id="current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-leaf/30 bg-white text-ink text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-leaf"
                required
              />
            </div>

            <div>
              <label htmlFor="new-pw" className="block text-xs font-bold text-ink mb-1">
                New Password (min 12 characters)
              </label>
              <input
                id="new-pw"
                type="password"
                minLength={12}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-leaf/30 bg-white text-ink text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-leaf"
                required
              />
            </div>

            <div>
              <label htmlFor="confirm-pw" className="block text-xs font-bold text-ink mb-1">
                Confirm New Password
              </label>
              <input
                id="confirm-pw"
                type="password"
                minLength={12}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-leaf/30 bg-white text-ink text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-leaf"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading || !currentPassword || newPassword.length < 12 || newPassword !== confirmPassword}
              className="w-full bg-leaf text-white font-extrabold hover:bg-leaf-mid transition-colors py-2.5 mt-2"
            >
              {loading ? 'Updating Password...' : 'Update Password'}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
