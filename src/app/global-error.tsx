'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Global Application Error]', error.digest || error.message);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ backgroundColor: '#FFFBE6', color: '#26331F', fontFamily: 'system-ui, sans-serif', margin: 0, padding: '24px' }}>
        <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '32px', maxWidth: '440px', width: '100%', textAlign: 'center', border: '1px solid #E4F6D2', boxShadow: '0 6px 18px rgba(31, 107, 58, 0.10)' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 12px 0', color: '#26331F' }}>
              Service Interruption
            </h1>
            <p style={{ fontSize: '14px', color: '#5C6B52', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              A critical error occurred while loading TableFlow. No sensitive data was exposed.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                padding: '12px 24px',
                borderRadius: '14px',
                backgroundColor: '#1F6B3A',
                color: '#FFFFFF',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
