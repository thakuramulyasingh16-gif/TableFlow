import QRCode from 'qrcode';
import { getEnv } from '../config/env.js';

export function buildTableQrUrl(qrToken) {
  const env = getEnv();
  const base = env.APP_BASE_URL.replace(/\/+$/, '');
  return `${base}/t/${qrToken}`;
}

export async function generateTableQrAssets(qrToken) {
  const url = buildTableQrUrl(qrToken);
  const [dataUrl, svg] = await Promise.all([
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
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
