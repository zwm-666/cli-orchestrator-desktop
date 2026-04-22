import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import importX from 'eslint-plugin-import-x'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'tmp/**', 'tmp_librarian/**'],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript strict + stylistic type-checked rules (TS/TSX files only)
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow `||` on primitive types where empty-string / 0 / false → fallback
      // is the intended semantic (e.g. `displayName || 'Unknown'`).
      '@typescript-eslint/prefer-nullish-coalescing': ['error', {
        ignorePrimitives: { string: true, number: true, boolean: true },
      }],
      // Allow `void expr` inside statements (used for fire-and-forget promises).
      '@typescript-eslint/no-confusing-void-expression': ['error', {
        ignoreVoidOperator: true,
      }],
      // Allow template literals with boolean/number; require explicit handling
      // only for truly unsafe types (object, any).
      '@typescript-eslint/restrict-template-expressions': ['error', {
        allowBoolean: true,
        allowNumber: true,
      }],
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
