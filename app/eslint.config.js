// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // `.expo` holds generated route declarations — written by
    // scripts/gen-route-types.mjs before the type check, gitignored, and not
    // ours to lint.
    ignores: ['dist/*', '.expo/*'],
  },
  {
    rules: {
      // Stylistic only — JSX renders literal quotes/apostrophes fine.
      // Disabled to avoid forcing &apos;/&quot; entities in localized strings.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
