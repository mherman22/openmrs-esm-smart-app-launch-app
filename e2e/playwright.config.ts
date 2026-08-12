import { defineConfig, devices } from '@playwright/test';

/**
 * These tests run against a running stack, not a dev server. A SMART launch starts at the
 * authorization server and finishes at the frontend served by OpenMRS, so both have to be real —
 * see the openmrs-distro-smartonfhir repository for bringing one up.
 *
 * They exist because the flow they cover cannot be verified any other way. Driven with curl it
 * passed while being completely broken in a browser: the single-page application shell redirects to
 * the login page before this screen can load, and only a real browser runs that shell.
 */
export default defineConfig({
  testDir: './specs',
  // A launch crosses two servers and boots the whole app shell; the default 30s is not enough.
  timeout: 3 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost/openmrs',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
