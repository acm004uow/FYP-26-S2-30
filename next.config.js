/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      // None of these are app source — Playwright writes into test-results/ and
      // playwright-report/ *while the dev server it's testing against is running*, and without
      // this, Next's watcher treats those writes as source changes and force-reloads the page
      // mid-test, silently killing whatever async flow was in flight.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/e2e/**', '**/test-results/**', '**/playwright-report/**', '**/node_modules/**'],
      }
    }
    return config
  },
}
module.exports = nextConfig
