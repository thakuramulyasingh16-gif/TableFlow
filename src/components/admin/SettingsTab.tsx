'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Button, Card, Badge } from '@/components/ui';

interface RestaurantSettingsData {
  id: number;
  restaurantName: string;
  legalName: string;
  address: string;
  phone: string | null;
  email: string | null;
  gstin: string;
  fssaiNumber: string;
  stateCode: string;
  stateName: string;
  hsnSacCode: string;
  cgstBps: number;
  sgstBps: number;
  paymentProvider: 'razorpay' | 'upi_qr';
  upiId: string | null;
}

export function SettingsTab({
  userRole,
  showToast,
}: {
  userRole?: string;
  showToast: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    restaurantName: '',
    legalName: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    fssaiNumber: '',
    stateCode: '',
    stateName: '',
    hsnSacCode: '',
    cgstBps: 250,
    sgstBps: 250,
    paymentProvider: 'razorpay' as 'razorpay' | 'upi_qr',
    upiId: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch<{ settings: RestaurantSettingsData }>('/api/admin/settings');
        setForm({
          restaurantName: res.settings.restaurantName || '',
          legalName: res.settings.legalName || '',
          address: res.settings.address || '',
          phone: res.settings.phone || '',
          email: res.settings.email || '',
          gstin: res.settings.gstin || '',
          fssaiNumber: res.settings.fssaiNumber || '',
          stateCode: res.settings.stateCode || '',
          stateName: res.settings.stateName || '',
          hsnSacCode: res.settings.hsnSacCode || '',
          cgstBps: res.settings.cgstBps ?? 250,
          sgstBps: res.settings.sgstBps ?? 250,
          paymentProvider: (res.settings.paymentProvider as 'razorpay' | 'upi_qr') || 'razorpay',
          upiId: res.settings.upiId || '',
        });
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [showToast]);

  const isOwner = userRole === 'owner';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) {
      showToast('Only owners can modify restaurant settings');
      return;
    }
    setSaving(true);
    try {
      await apiFetch<{ settings: RestaurantSettingsData }>('/api/admin/settings', {
        method: 'PATCH',
        csrf: true,
        body: form,
      });
      showToast('Settings saved successfully!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted">Loading settings...</div>;
  }

  return (
    <Card className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-sun/30 pb-4">
        <div>
          <h2 className="text-[20px] font-extrabold text-ink">Restaurant & Tax Settings</h2>
          <p className="text-[13px] text-muted">
            Configure Indian GST compliance and payment gateway providers
          </p>
        </div>
        <Badge tone={isOwner ? 'leaf' : 'ink'}>{isOwner ? 'Owner Access' : 'Read Only'}</Badge>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Payment Provider Selection */}
        <div className="p-4 rounded-2xl bg-cream border border-sun/40 space-y-4">
          <h3 className="text-[15px] font-bold text-ink">Payment Provider & Methods</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label
              className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition ${
                form.paymentProvider === 'razorpay' ? 'border-leaf bg-white' : 'border-transparent bg-white/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="paymentProvider"
                  value="razorpay"
                  disabled={!isOwner}
                  checked={form.paymentProvider === 'razorpay'}
                  onChange={() => setForm((prev) => ({ ...prev, paymentProvider: 'razorpay' }))}
                  className="accent-leaf"
                />
                <span className="font-extrabold text-ink text-[14px]">Razorpay Gateway</span>
              </div>
              <span className="text-[11px] text-muted mt-1 ml-5">
                Credit/Debit cards, Netbanking, UPI Intent & QR via Razorpay
              </span>
            </label>

            <label
              className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition ${
                form.paymentProvider === 'upi_qr' ? 'border-leaf bg-white' : 'border-transparent bg-white/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="paymentProvider"
                  value="upi_qr"
                  disabled={!isOwner}
                  checked={form.paymentProvider === 'upi_qr'}
                  onChange={() => setForm((prev) => ({ ...prev, paymentProvider: 'upi_qr' }))}
                  className="accent-leaf"
                />
                <span className="font-extrabold text-ink text-[14px]">Zero-Fee UPI QR</span>
              </div>
              <span className="text-[11px] text-muted mt-1 ml-5">
                Direct bank UPI QR code (0% gateway fee). Waitstaff confirms receipt.
              </span>
            </label>
          </div>

          <div>
            <label htmlFor="settings-upi-id" className="block text-xs font-bold text-ink mb-1">
              Restaurant UPI ID (VPA)
            </label>
            <input
              id="settings-upi-id"
              type="text"
              disabled={!isOwner}
              value={form.upiId}
              onChange={(e) => setForm((prev) => ({ ...prev, upiId: e.target.value }))}
              placeholder="e.g. tableflow@okaxis or 9876543210@upi"
              className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm font-mono focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
            />
            <p className="text-[11px] text-muted mt-1">
              Used when Zero-Fee UPI QR is active for customer payments.
            </p>
          </div>
        </div>

        {/* GST & Legal Details */}
        <div className="space-y-4">
          <h3 className="text-[15px] font-bold text-ink">Legal & GST Compliance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="settings-rest-name" className="block text-xs font-bold text-ink mb-1">
                Restaurant Display Name
              </label>
              <input
                id="settings-rest-name"
                type="text"
                disabled={!isOwner}
                value={form.restaurantName}
                onChange={(e) => setForm((prev) => ({ ...prev, restaurantName: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="settings-legal-name" className="block text-xs font-bold text-ink mb-1">
                Legal Entity Name
              </label>
              <input
                id="settings-legal-name"
                type="text"
                disabled={!isOwner}
                value={form.legalName}
                onChange={(e) => setForm((prev) => ({ ...prev, legalName: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="settings-address" className="block text-xs font-bold text-ink mb-1">
                Registered Address
              </label>
              <input
                id="settings-address"
                type="text"
                disabled={!isOwner}
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="settings-gstin" className="block text-xs font-bold text-ink mb-1">
                GSTIN
              </label>
              <input
                id="settings-gstin"
                type="text"
                disabled={!isOwner}
                value={form.gstin}
                onChange={(e) => setForm((prev) => ({ ...prev, gstin: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="settings-fssai" className="block text-xs font-bold text-ink mb-1">
                FSSAI License Number
              </label>
              <input
                id="settings-fssai"
                type="text"
                disabled={!isOwner}
                value={form.fssaiNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, fssaiNumber: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm font-mono focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="settings-state-code" className="block text-xs font-bold text-ink mb-1">
                State Code (e.g. 06 for Haryana)
              </label>
              <input
                id="settings-state-code"
                type="text"
                disabled={!isOwner}
                value={form.stateCode}
                onChange={(e) => setForm((prev) => ({ ...prev, stateCode: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm font-mono focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="settings-state-name" className="block text-xs font-bold text-ink mb-1">
                State Name
              </label>
              <input
                id="settings-state-name"
                type="text"
                disabled={!isOwner}
                value={form.stateName}
                onChange={(e) => setForm((prev) => ({ ...prev, stateName: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="settings-hsn" className="block text-xs font-bold text-ink mb-1">
                HSN/SAC Code (Default: 996331)
              </label>
              <input
                id="settings-hsn"
                type="text"
                disabled={!isOwner}
                value={form.hsnSacCode}
                onChange={(e) => setForm((prev) => ({ ...prev, hsnSacCode: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm font-mono focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="settings-cgst" className="block text-xs font-bold text-ink mb-1">
                  CGST (bps)
                </label>
                <input
                  id="settings-cgst"
                  type="number"
                  disabled={!isOwner}
                  value={form.cgstBps}
                  onChange={(e) => setForm((prev) => ({ ...prev, cgstBps: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
                />
                <span className="text-[10px] text-muted">250 bps = 2.5%</span>
              </div>
              <div>
                <label htmlFor="settings-sgst" className="block text-xs font-bold text-ink mb-1">
                  SGST (bps)
                </label>
                <input
                  id="settings-sgst"
                  type="number"
                  disabled={!isOwner}
                  value={form.sgstBps}
                  onChange={(e) => setForm((prev) => ({ ...prev, sgstBps: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 rounded-xl border border-sun bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-leaf disabled:opacity-60"
                />
                <span className="text-[10px] text-muted">250 bps = 2.5%</span>
              </div>
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="pt-4 border-t border-sun/30 flex justify-end">
            <Button variant="leaf" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
