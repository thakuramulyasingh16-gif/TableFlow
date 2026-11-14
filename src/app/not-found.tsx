import Link from 'next/link';
import { UtensilsCrossed } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[var(--tf-cream)] flex items-center justify-center p-4">
      <div className="bg-white rounded-[20px] p-8 max-w-md w-full text-center shadow-[var(--shadow-card)] border border-[#E4F6D2]">
        <div className="w-16 h-16 rounded-full bg-[#E4F6D2] text-[#1F6B3A] flex items-center justify-center mx-auto mb-4">
          <UtensilsCrossed className="w-8 h-8" />
        </div>
        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-[#FFE066] text-[#26331F] mb-3">
          404 · Page Not Found
        </span>
        <h1 className="text-2xl font-extrabold text-[#26331F] mb-2 font-display">
          Table Not Set
        </h1>
        <p className="text-sm text-[#5C6B52] mb-6">
          We couldn&apos;t find the page or table you were looking for. Please check the URL or scan your table QR code again.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center w-full py-3 px-6 rounded-[14px] bg-[#1F6B3A] hover:bg-[#3E9A4F] text-white font-bold transition-colors shadow-sm"
        >
          Return to TableFlow
        </Link>
      </div>
    </main>
  );
}
