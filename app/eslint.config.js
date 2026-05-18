// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // Stylistic only — JSX renders literal quotes/apostrophes fine.
      // Disabled to avoid forcing &apos;/&quot; entities in localized strings.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
