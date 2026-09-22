import { defineConfig } from '@playwright/test'
// Always test this checkout instead of reusing another worktree's dev server.
export default defineConfig({ testDir: './tests', fullyParallel: true, use: { baseURL: 'http://127.0.0.1:5179', channel: 'chrome', headless: true }, webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5179 --strictPort', url: 'http://127.0.0.1:5179', reuseExistingServer: false } })
