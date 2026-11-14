'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import QRCode from 'qrcode';
import { ShieldCheck, LogOut, Copy, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { apiFetch } from '@/lib/api-client';

interface SetupResponse {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

export default function MfaSetupPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [setupData, setSetupData] = useState<SetupResponse | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [initiating, setInitiating] = useState(true);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    async function initMfa() {
      try {
        setInitiating(true);
        setError('');
        const data = await apiFetch<SetupResponse>('/api/staff/auth/mfa/setup', {
          method: 'POST',
          body: {},
        });
        setSetupData(data);
        if (data.otpauthUrl) {
          const url = await QRCode.toDataURL(data.otpauthUrl, {
            width: 200,
            margin: 2,
            color: { dark: '#26331F', light: '#FFFFFF' },
          });
          setQrCodeUrl(url);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to initialize MFA setup.');
      } finally {
        setInitiating(false);
      }
    }

    void initMfa();
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (totpCode.trim().length !== 6) {
      setError('Please enter a valid 6-digit verification code.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await apiFetch<{ success: boolean; message: string }>('/api/staff/auth/mfa/verify', {
        method: 'POST',
        body: { code: totpCode.trim() },
      });

      setSuccess('Two-factor authentication verified successfully! Redirecting...');
      await update({ mfaSetupRequired: false });

      setTimeout(() => {
        const role = (session?.user as { role?: string } | undefined)?.role;
        if (role === 'owner' || role === 'manager') {
          router.push('/admin');
        } else if (role === 'chef') {
          router.push('/kitchen');
        } else {
          router.push('/staff');
        }
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  }

  function copySecret() {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  }

  function copyCodes() {
    if (setupData?.recoveryCodes) {
      navigator.clipboard.writeText(setupData.recoveryCodes.join('\n'));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <Card className="w-full max-w-xl overflow-hidden shadow-card">
        <div className="bg-signature-gradient p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-leaf/10 flex items-center justify-center text-leaf font-bold">
                <ShieldCheck className="w-6 h-6 text-leaf" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-ink leading-tight">
                  Two-Factor Authentication Setup
                </h1>
                <p className="text-xs font-semibold text-muted">
                  Mandatory security enrollment for privileged accounts
                </p>
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

        <div className="p-6 space-y-6">
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

          {initiating ? (
            <div className="py-12 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-leaf border-t-transparent mb-3" />
              <p className="text-xs font-semibold text-muted">Generating secure MFA keys...</p>
            </div>
          ) : setupData ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center gap-6 bg-mint-bg/40 p-4 rounded-xl border border-leaf/10">
                {qrCodeUrl && (
                  <div className="bg-white p-2 rounded-lg shadow-sm shrink-0 border border-leaf/15">
                    <Image
                      src={qrCodeUrl}
                      alt="TOTP QR Code"
                      width={160}
                      height={160}
                      className="rounded"
                      unoptimized
                    />
                  </div>
                )}
                <div className="space-y-2 text-center sm:text-left">
                  <h2 className="text-sm font-bold text-ink">1. Scan with Authenticator App</h2>
                  <p className="text-xs text-muted leading-relaxed">
                    Scan this QR code using Google Authenticator, Microsoft Authenticator, or 1Password.
                  </p>
                  <div className="pt-2">
                    <span className="text-[11px] font-semibold text-muted block mb-1">
                      Can&apos;t scan? Manual entry key:
                    </span>
                    <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                      <code className="text-xs font-mono font-bold bg-white px-2 py-1 rounded border border-leaf/20 text-leaf select-all">
                        {setupData.secret}
                      </code>
                      <button
                        type="button"
                        onClick={copySecret}
                        className="p-1 rounded hover:bg-leaf/10 text-muted hover:text-leaf transition-colors"
                        title="Copy secret"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {copiedSecret && <span className="text-[10px] text-leaf font-bold">Copied!</span>}
                    </div>
                  </div>
                </div>
              </div>

              {setupData.recoveryCodes && setupData.recoveryCodes.length > 0 && (
                <div className="bg-sun/10 border border-sun p-4 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-ink">2. Save Your Recovery Codes</h3>
                    <button
                      type="button"
                      onClick={copyCodes}
                      className="flex items-center gap-1 text-[11px] font-bold text-leaf hover:underline"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedCodes ? 'Copied!' : 'Copy all'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-muted">
                    Store these in a safe place. If you lose access to your authenticator, each code can be used once.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {setupData.recoveryCodes.map((code, idx) => (
                      <div
                        key={idx}
                        className="text-[11px] font-mono font-bold bg-white px-2 py-1 rounded border border-sun/40 text-ink text-center"
                      >
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label htmlFor="totp-code" className="block text-xs font-bold text-ink mb-1.5">
                    3. Enter 6-digit Code from Authenticator
                  </label>
                  <input
                    id="totp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-center text-xl font-mono tracking-widest px-3 py-2.5 rounded-xl border border-leaf/30 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-leaf font-bold"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading || totpCode.length !== 6}
                  className="w-full bg-leaf text-white font-extrabold hover:bg-leaf-mid transition-colors py-2.5"
                >
                  {loading ? 'Verifying...' : 'Verify & Complete Setup'}
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
