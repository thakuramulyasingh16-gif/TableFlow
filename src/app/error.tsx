'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log safe error digest to monitoring service; never render raw stack trace in UI
    console.error('[Application Error]', error.digest || error.message);
  }, [error]);

  return (
    <main className="min-h-screen bg-[var(--tf-cream)] flex items-center justify-center p-4">
      <div className="bg-white rounded-[20px] p-8 max-w-md w-full text-center shadow-[var(--shadow-card)] border border-[#E4F6D2]">
        <div className="w-16 h-16 rounded-full bg-[#FFE9A0] text-[#C73A25] flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-[#FFE9A0] text-[#5A4300] mb-3">
          Something went wrong
        </span>
        <h1 className="text-2xl font-extrabold text-[#26331F] mb-2 font-display">
          Kitchen Hiccup
        </h1>
        <p className="text-sm text-[#5C6B52] mb-6">
          We experienced an unexpected error processing your request. Our team has been notified.
        </p>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-6 rounded-[14px] bg-[#1F6B3A] hover:bg-[#3E9A4F] text-white font-bold transition-colors cursor-pointer shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="w-full inline-flex items-center justify-center py-2.5 px-6 rounded-[14px] border border-[#E4F6D2] text-[#26331F] font-semibold hover:bg-[#FFFBE6] transition-colors"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
