import { prisma } from './prisma';
import { getEnv } from './env';

export interface RestaurantSettingsData {
  id: number;
  restaurantName: string;
  legalName: string;
  address: string;
  phone: string | null;
  email: string | null;
  gstin: string;
  fssaiNumber: string;
  stateCode: string;
  stateName: string;
  hsnSacCode: string;
  cgstBps: number;
  sgstBps: number;
  paymentProvider: string;
  upiId: string | null;
}

/**
 * Returns the restaurant settings singleton row.
 * Initializes default Indian GST compliant settings if not yet present in database.
 */
export async function getRestaurantSettings(): Promise<RestaurantSettingsData> {
  const existing = await prisma.restaurantSettings.findFirst();
  if (existing) {
    return existing;
  }

  const env = getEnv();
  const created = await prisma.restaurantSettings.create({
    data: {
      restaurantName: process.env.NEXT_PUBLIC_RESTAURANT_NAME || 'TableFlow Bistro',
      legalName: 'TableFlow Hospitality Private Limited',
      address: 'Plot 42, Sector 18, Gurugram, Haryana - 122002',
      phone: '+91 98765 43210',
      email: 'billing@tableflow.in',
      gstin: '06AAACT2727Q1ZB',
      fssaiNumber: '10822005000123',
      stateCode: '06',
      stateName: 'Haryana',
      hsnSacCode: '996331',
      cgstBps: env.CGST_BPS || 250,
      sgstBps: env.SGST_BPS || 250,
      paymentProvider: 'razorpay',
      upiId: 'tableflow@okaxis',
    },
  });

  return created;
}
