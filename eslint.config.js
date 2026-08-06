import js from '@eslint/js'
import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const restrictedZones = [
  {
    target: './src/domain',
    from: './src',
    except: ['./domain'],
    message: 'Domain code must stay pure and may only import from zod or date-fns.',
  },
  {
    target: './src/services',
    from: './src',
    except: ['./domain', './services'],
    message: 'Services may only import domain code and other service modules.',
  },
  {
    target: './src/store',
    from: './src',
    except: ['./domain', './services', './store'],
    message: 'Stores may only import domain types and services.',
  },
  {
    target: './src/hooks',
    from: './src',
    except: ['./domain', './store', './hooks'],
    message: 'Hooks may only import domain code, stores, and other hooks.',
  },
  {
    target: './src/components',
    from: './src',
    except: ['./domain/types', './hooks', './components'],
    message: 'Components may only import hooks, domain types, and components.',
  },
]

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-desktop',
      'build',
      'coverage',
      'playwright-report',
      'test-results',
      'scratch',
      'src-tauri/target',
      '.pytest_cache',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      import: importPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      'import/resolver': {
        typescript: true,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'import/no-restricted-paths': ['error', { zones: restrictedZones }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
  },
)
