import QRCode from 'qrcode';

import { getDefaultAppUrl } from './config';

/**
 * Generate a QR code as a data URL for the member portal
 */
export async function generateMemberQRCode(memberNumber: string): Promise<string> {
  const dashboardUrl = `${getDefaultAppUrl()}/member?ref=${memberNumber}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(dashboardUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#0f766e',
        light: '#ffffff',
      },
    });
    return qrDataUrl;
  } catch {
    console.error('Failed to generate QR code');
    return '';
  }
}
