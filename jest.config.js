// next/jest wires up the same transforms Next.js uses (JSX, env vars),
// so no separate Babel config is needed.
const nextJest = require('next/jest')
const createJestConfig = nextJest({ dir: './' })

module.exports = createJestConfig({
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  collectCoverageFrom: ['lib/**/*.js', '!lib/supabase*.js'],
})
