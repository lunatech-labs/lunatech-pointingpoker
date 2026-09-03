import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // node --test owns test/, so the two runners cannot pick up each other's files.
  testDir: 'e2e',
  reporter: 'list',
  // The per-worker asset cache keeps the CDNs off the critical path, so retries buy nothing.
  retries: 0,
  // A test.fail() case that passes then fails-as-expected on retry reports flaky and exits 0.
  failOnFlakyTests: true,
  // Each worker boots its own JVM and stub; two is the ceiling worth paying for on CI.
  workers: process.env.CI ? 2 : undefined,
  // Three reconnect cases can exceed the 30s default once their own assertion timeouts sum.
  timeout: 60_000,
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ]
})
