module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.eslint.json',
  },
  plugins: [
    '@typescript-eslint',
  ],
  rules: {
    // Relaxar algumas regras para permitir flexibilidade no desenvolvimento
    '@typescript-eslint/no-unused-vars': ['warn', { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-require-imports': 'warn',
    '@typescript-eslint/no-empty-object-type': 'warn',
    '@typescript-eslint/no-unsafe-function-type': 'warn',
    '@typescript-eslint/no-namespace': 'warn',
    'no-console': 'off',
    'prefer-const': 'warn',
    'no-var': 'error',
    'no-empty': ['error', { "allowEmptyCatch": true }],
    'no-useless-escape': 'warn',
    'no-case-declarations': 'warn',
    'no-misleading-character-class': 'warn',
    'no-prototype-builtins': 'warn',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '*.js',
    'src/frontend/',
    'src/**/*.d.ts',
    '*.backup.ts',
    'src/routes/*backup*.ts',
  ],
};