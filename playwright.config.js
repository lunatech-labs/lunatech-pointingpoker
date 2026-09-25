import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // node --test owns test/, so the two runners cannot pick up each other's files.
  testDir: 'e2e',
  // Annotations put a CI failure inline on the PR; the traces in the artifact say why.
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // Nothing off-origin is loaded, so a retry has no flaky network to paper over.
  retries: 0,
  // Insurance for a future retries change: a test.fail() case that passes then fails-as-expected
  // on retry would otherwise report flaky and exit 0.
  failOnFlakyTests: true,
  // A stray test.only would narrow a characterization suite to one case and still exit 0.
  forbidOnly: !!process.env.CI,
  // Each worker boots its own JVM and stub; two is the ceiling worth paying for on CI.
  workers: process.env.CI ? 2 : undefined,
  // Three reconnect cases can exceed the 30s default once their own assertion timeouts sum.
  timeout: 60_000,
  // Bounds a navigation that hangs, which waitUntil cannot and the mount assertion never reaches.
  use: { trace: 'retain-on-failure', navigationTimeout: 20_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ]
})
