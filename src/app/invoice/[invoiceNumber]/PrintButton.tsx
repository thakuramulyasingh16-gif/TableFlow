'use client';

import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[12px] bg-[#1F6B3A] hover:bg-[#3E9A4F] text-white font-bold transition-colors cursor-pointer print:hidden shadow-sm"
    >
      <Printer className="w-4 h-4" />
      Print / Save PDF
    </button>
  );
}
