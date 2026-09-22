import { test as base, expect } from '@playwright/test'

// Existing feature tests exercise a returning user. First-run behavior has its own suite.
export const test = base.extend<{ returningUser: void }>({
  returningUser: [async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('little-day-recommendation-onboarding-v1', 'skipped'))
    await use()
  }, { auto: true }],
})
export { expect }
