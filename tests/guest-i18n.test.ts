import test from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARIES, getTranslations, Locale, Translations } from '../src/lib/i18n';

test('getTranslations returns English dictionary by default and for "en"', () => {
  const en = getTranslations('en');
  assert.equal(en.callWaiter, 'Call Waiter');
  assert.equal(en.yourCart, 'Your Cart');
  assert.equal(en.placeOrder, 'Send Order to Kitchen');
  assert.equal(en.vegOnly, 'Veg Only');
});

test('getTranslations returns Hindi dictionary for "hi" with authentic Devanagari text', () => {
  const hi = getTranslations('hi');
  assert.equal(hi.callWaiter, 'वेटर बुलाएँ');
  assert.equal(hi.yourCart, 'आपकी कार्ट');
  assert.equal(hi.placeOrder, 'रसोई को ऑर्डर भेजें');
  assert.equal(hi.vegOnly, 'केवल शाकाहारी');
  assert.equal(hi.table, 'टेबल');
  assert.equal(hi.pin, 'पिन');
  assert.equal(hi.viewBill, 'बिल देखें');
  assert.equal(hi.add, 'जोड़ें');
  assert.equal(hi.soldOut, 'समाप्त (उपलब्ध नहीं)');
});

test('getTranslations falls back gracefully to English for unsupported or unknown locales', () => {
  const fallback = getTranslations('fr' as unknown as Locale);
  assert.equal(fallback.callWaiter, 'Call Waiter');
  assert.equal(fallback.yourCart, 'Your Cart');
});

test('English and Hindi dictionaries have 100% complete key parity with non-empty translations', () => {
  const enKeys = Object.keys(DICTIONARIES.en) as (keyof Translations)[];
  const hiKeys = Object.keys(DICTIONARIES.hi) as (keyof Translations)[];

  assert.equal(enKeys.length, hiKeys.length, 'English and Hindi dictionaries must have identical key counts');

  for (const key of enKeys) {
    const enVal = DICTIONARIES.en[key];
    const hiVal = DICTIONARIES.hi[key];

    assert.ok(typeof enVal === 'string' && enVal.trim().length > 0, `English key "${key}" must be non-empty string`);
    assert.ok(typeof hiVal === 'string' && hiVal.trim().length > 0, `Hindi key "${key}" must be non-empty string`);
  }
});
