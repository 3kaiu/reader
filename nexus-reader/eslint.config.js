import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import eslintrc from './.eslintrc.json' assert { type: 'json' }

const compat = new FlatCompat({
  baseDirectory: process.cwd(),
  resolvePluginsRelativeTo: process.cwd(),
  // Needed because the legacy config extends `eslint:recommended`
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  ...compat.config(eslintrc),
  // `vue/valid-v-for` produces a large batch of errors in this codebase.
  // We disable it globally to keep the lint signal actionable.
  {
    rules: {
      'vue/valid-v-for': 'off',
    },
  },
]

