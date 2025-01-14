module.exports = {
  root: true,
  parser: '@typescript-eslint/parser', // @typescript-eslint/parser@5.59.0
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    },
    project: './tsconfig.json',
    tsconfigRootDir: '.',
    createDefaultProgram: true
  },
  settings: {
    react: {
      version: '18.2'
    }
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended', // eslint-plugin-react@7.32.2
    'plugin:react-hooks/recommended', // eslint-plugin-react-hooks@4.6.0
    'prettier' // eslint-config-prettier@8.8.0
  ],
  plugins: [
    '@typescript-eslint', // @typescript-eslint/eslint-plugin@5.59.0
    'react',
    'react-hooks'
  ],
  rules: {
    // TypeScript specific rules
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', {
      argsIgnorePattern: '^_'
    }],
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    '@typescript-eslint/restrict-template-expressions': 'error',
    '@typescript-eslint/unbound-method': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/ban-types': ['error', {
      types: {
        '{}': {
          message: 'Use object instead',
          fixWith: 'object'
        },
        'Function': {
          message: 'Specify the function type',
          fixWith: '(...args: any[]) => any'
        }
      }
    }],

    // React specific rules
    'react/react-in-jsx-scope': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react/prop-types': 'off',
    'react/jsx-no-target-blank': 'error',
    'react/jsx-key': ['error', {
      checkFragmentShorthand: true
    }],
    'react/jsx-boolean-value': ['error', 'never'],
    'react/jsx-no-useless-fragment': 'error',
    'react/jsx-pascal-case': 'error',
    'react/no-array-index-key': 'error',
    'react/no-unused-prop-types': 'error',
    'react/self-closing-comp': 'error',
    'react/function-component-definition': ['error', {
      namedComponents: 'arrow-function',
      unnamedComponents: 'arrow-function'
    }],

    // General code quality rules
    'no-console': ['warn', {
      allow: ['warn', 'error']
    }],
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-duplicate-imports': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-template': 'error',
    'require-await': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'arrow-body-style': ['error', 'as-needed'],
    'spaced-comment': ['error', 'always'],
    'sort-imports': ['error', {
      ignoreCase: true,
      ignoreDeclarationSort: true
    }]
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx'],
      env: {
        jest: true
      },
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off'
      }
    }
  ],
  env: {
    browser: true,
    es2022: true,
    node: true
  }
};