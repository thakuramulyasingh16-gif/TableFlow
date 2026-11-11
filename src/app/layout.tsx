import type { Metadata } from 'next';
import Script from 'next/script';
import { SessionProvider } from 'next-auth/react';
import './globals.css';

export const metadata: Metadata = {
  title: 'TableFlow — Smart QR Dining & Kitchen Flow',
  description: 'QR-based restaurant ordering, live kitchen display, floor management, and UPI payments.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-stone-50 text-stone-900 antialiased">
        <SessionProvider>{children}</SessionProvider>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
