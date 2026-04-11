import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import importX from 'eslint-plugin-import-x'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'tmp/**'],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript strict + stylistic type-checked rules
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // TypeScript parser options (applies to all TS/TSX files)
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // React plugin for TSX files
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
    },
    settings: {
      react: {
        version: '18',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
    },
  },

  // ESM import rules
  {
    plugins: {
      'import-x': importX,
    },
    rules: {
      'import-x/no-commonjs': 'error',
      'import-x/no-amd': 'error',
      'import-x/extensions': ['error', 'ignorePackages'],
    },
  },

  // Prettier compat (must be last to turn off conflicting rules)
  prettierConfig,
)
