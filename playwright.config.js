import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  // node --test owns test/, so the two runners cannot pick up each other's files.
  testDir: 'e2e',
  reporter: 'list',
  // The page pulls Vue, axios and feather from public CDNs, so a run can fail on the network.
  retries: process.env.CI ? 1 : 0,
  // Each worker boots its own JVM and stub; two is the ceiling worth paying for on CI.
  workers: process.env.CI ? 2 : undefined,
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ]
})
