import QRCode from 'qrcode';
import { getEnv } from './env';

export function buildTableQrUrl(qrToken: string): string {
  const env = getEnv();
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  return `${base}/t/${qrToken}`;
}

export async function generateTableQrAssets(
  qrToken: string
): Promise<{ url: string; dataUrl: string; svg: string }> {
  const url = buildTableQrUrl(qrToken);
  const [dataUrl, svg] = await Promise.all([
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#111827', light: '#FFFFFF' },
    }),
    QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
    }),
  ]);
  return { url, dataUrl, svg };
}
