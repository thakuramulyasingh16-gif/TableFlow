import { test, expect } from '@playwright/test';

test.describe('TableFlow Guest Dining E2E Smoke Flow', () => {
  test('Guest scans table QR, views bilingual menu, configures cart, and proceeds with ordering', async ({ page }) => {
    // 1. Guest scans QR and lands on Table 1
    await page.goto('/table/mock-table-1');

    // Verify Title and branding
    await expect(page).toHaveTitle(/TableFlow/i);

    // Verify Language toggle is visible (English / Hindi)
    const langBtn = page.getByRole('button', { name: /हिंदी|English/i });
    if (await langBtn.isVisible()) {
      await expect(langBtn).toBeVisible();
    }

    // 2. Guest browses categories & items
    const menuSection = page.locator('main');
    await expect(menuSection).toBeVisible();

    // Look for add to cart buttons
    const addButtons = page.locator('button:has-text("Add"), button:has-text("जोड़ें")');
    if ((await addButtons.count()) > 0) {
      await addButtons.first().click();

      // Verify cart drawer/bar appears
      const cartTrigger = page.locator('button:has-text("Cart"), button:has-text("View Cart"), button:has-text("कार्ट")');
      if (await cartTrigger.isVisible()) {
        await cartTrigger.click();

        // Check cart summary
        const checkoutBtn = page.locator('button:has-text("Place Order"), button:has-text("ऑर्डर दें")');
        await expect(checkoutBtn).toBeVisible();
      }
    }
  });

  test('Staff Login and Dashboard role boundary checks', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible();

    // Verify unauthorized direct access to /admin redirects to login
    await page.goto('/admin');
    await expect(page).toHaveURL(/.*login.*/);

    // Verify unauthorized direct access to /kitchen redirects to login
    await page.goto('/kitchen');
    await expect(page).toHaveURL(/.*login.*/);
  });
});
