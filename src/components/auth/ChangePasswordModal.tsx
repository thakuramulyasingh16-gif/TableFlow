'use client';

import React, { useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Button, Modal, PasswordField } from '@/components/ui';

export interface ChangePasswordModalProps {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ChangePasswordModal({ isOpen, open, onClose, onSuccess }: ChangePasswordModalProps) {
  const isModalOpen = open ?? isOpen ?? false;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    setSubmitting(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

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

    setSubmitting(true);
    try {
      const res = await apiFetch<{ success: boolean; message: string }>('/api/staff/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });

      setSuccess(res.message || 'Password changed successfully!');
      setTimeout(() => {
        handleClose();
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={isModalOpen} onClose={handleClose} title="Change Password">
      <div className="space-y-4">
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-tomato/10 border border-tomato/30 text-tomato text-[13px] font-bold"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="p-3 rounded-xl bg-leaf/10 border border-leaf/30 text-leaf text-[13px] font-bold"
          >
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <PasswordField
            id="modal-current-password"
            label="Current Password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
            autoComplete="current-password"
            required
          />

          <PasswordField
            id="modal-new-password"
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
            id="modal-confirm-password"
            label="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />

          <div className="flex gap-2 justify-end pt-3">
            <Button
              type="button"
              variant="outline-tomato"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="leaf"
              disabled={submitting}
              className="font-extrabold"
            >
              {submitting ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
