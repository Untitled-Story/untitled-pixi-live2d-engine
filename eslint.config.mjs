import { defineConfig, globalIgnores } from 'eslint/config'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import prettier from 'eslint-plugin-prettier'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)
const compat = new FlatCompat({
  baseDirectory: _dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

export default defineConfig([
  globalIgnores([
    'cubism',
    '**/dist',
    '**/coverage',
    '**/test.build',
    'overrides',
    'types',
    'tests/**',
    '**/Core',
    '!Core/README.md',
    '!Core/live2d.d.ts'
  ]),
  {
    extends: compat.extends(
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended-type-checked'
    ),

    plugins: {
      '@typescript-eslint': typescriptEslint,
      prettier
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.mocha
      },

      parser: tsParser,
      ecmaVersion: 5,
      sourceType: 'commonjs',

      parserOptions: {
        project: path.resolve(_dirname, 'eslint-tsconfig.json')
      }
    },

    rules: {
      'prettier/prettier': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          disallowTypeAnnotations: false
        }
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/triple-slash-reference': 'warn',
      'arrow-body-style': 'off',
      'prefer-arrow-callback': 'off'
    }
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    extends: compat.extends('plugin:@typescript-eslint/disable-type-checked'),
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: null
      }
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off'
    }
  },
  {
    files: ['test/**/*'],

    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off'
    }
  }
])
