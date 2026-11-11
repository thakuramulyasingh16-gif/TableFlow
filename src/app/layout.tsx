import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import Script from 'next/script';
import { SessionProvider } from 'next-auth/react';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['500', '700', '800'],
  variable: '--font-nunito',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TableFlow — Smart QR Dining & Kitchen Flow',
  description: 'QR-based restaurant ordering, live kitchen display, floor management, and UPI payments.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="min-h-screen bg-cream text-ink font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
