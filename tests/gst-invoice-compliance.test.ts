import test from 'node:test';
import assert from 'node:assert/strict';
import { getIndianFinancialYear } from '../src/lib/invoice';
import { getRestaurantSettings } from '../src/lib/settings';
import { updateRestaurantSettingsSchema } from '../src/lib/validators';

test('GST Compliance: getIndianFinancialYear correctly computes financial years across boundaries', () => {
  // April 1, 2026 -> FY 2026-27
  assert.equal(getIndianFinancialYear(new Date(2026, 3, 1)), '2026-27');

  // November 14, 2026 -> FY 2026-27
  assert.equal(getIndianFinancialYear(new Date(2026, 10, 14)), '2026-27');

  // March 31, 2027 -> FY 2026-27
  assert.equal(getIndianFinancialYear(new Date(2027, 2, 31)), '2026-27');

  // February 15, 2027 -> FY 2026-27
  assert.equal(getIndianFinancialYear(new Date(2027, 1, 15)), '2026-27');

  // April 1, 2027 -> FY 2027-28
  assert.equal(getIndianFinancialYear(new Date(2027, 3, 1)), '2027-28');

  // March 15, 2026 -> FY 2025-26
  assert.equal(getIndianFinancialYear(new Date(2026, 2, 15)), '2025-26');
});

test('GST Compliance: getRestaurantSettings initializes and returns complete India compliance details', async () => {
  const settings = await getRestaurantSettings();

  assert.ok(settings.legalName, 'legalName must be defined');
  assert.ok(settings.restaurantName, 'restaurantName must be defined');
  assert.ok(settings.address, 'address must be defined');
  assert.ok(settings.gstin, 'gstin must be defined');
  assert.ok(settings.fssaiNumber, 'fssaiNumber must be defined');
  assert.ok(settings.stateCode, 'stateCode must be defined');
  assert.ok(settings.stateName, 'stateName must be defined');
  assert.equal(settings.hsnSacCode, '996331', 'Restaurant services SAC code must be 996331');
  assert.equal(settings.cgstBps, 250, 'Default CGST must be 2.5% (250 bps)');
  assert.equal(settings.sgstBps, 250, 'Default SGST must be 2.5% (250 bps)');
});

test('GST Compliance: updateRestaurantSettingsSchema validates GSTIN, FSSAI, and rate bounds', () => {
  // Valid Indian GSTIN: 2 digits state + 5 chars PAN + 4 digits PAN + 1 char entity + 1 char Z + 1 check digit
  const valid = updateRestaurantSettingsSchema.safeParse({
    gstin: '06AAACT2727Q1ZB',
    fssaiNumber: '10822005000123',
    stateCode: '06',
    cgstBps: 250,
    sgstBps: 250,
    legalName: 'Gourmet Bistro LLP',
  });
  assert.equal(valid.success, true);

  // Invalid GSTIN (wrong length / characters)
  const invalidGstin = updateRestaurantSettingsSchema.safeParse({
    gstin: 'INVALIDGSTIN123',
  });
  assert.equal(invalidGstin.success, false);

  // Invalid FSSAI (not 14 digits)
  const invalidFssai = updateRestaurantSettingsSchema.safeParse({
    fssaiNumber: '12345',
  });
  assert.equal(invalidFssai.success, false);

  // Invalid State Code (not 2 digits)
  const invalidState = updateRestaurantSettingsSchema.safeParse({
    stateCode: '6',
  });
  assert.equal(invalidState.success, false);
});

test('GST Compliance: Gap-free sequential invoice number generation simulation', () => {
  const fy = '2026-27';
  let lastNumber = 0;

  function nextInvoiceNumber() {
    lastNumber += 1;
    return `INV/${fy}/${String(lastNumber).padStart(5, '0')}`;
  }

  const inv1 = nextInvoiceNumber();
  const inv2 = nextInvoiceNumber();
  const inv3 = nextInvoiceNumber();

  assert.equal(inv1, 'INV/2026-27/00001');
  assert.equal(inv2, 'INV/2026-27/00002');
  assert.equal(inv3, 'INV/2026-27/00003');
});
