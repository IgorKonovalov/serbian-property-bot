# Plan: Testing, Linting & TypeScript Setup

**Date:** 2026-03-30
**Status:** Completed

## Goal

Introduce TypeScript, consistent testing, and linting practices to property-bot, adapted from music_production_suite patterns and fitted to a Node.js Telegram bot project.

## Current State

- No linting, formatting, testing, or type-checking tooling configured
- No git hooks
- Stack: Node.js + Telegraf + Puppeteer + dotenv (CommonJS, plain JS)
- Empty `src/bot/` and `src/parsers/` directories

## Reference: music_production_suite practices

| Practice    | Tool                                            | Details                                                                                    |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| TypeScript  | `typescript`, `@typescript-eslint/*`, `ts-jest` | Strict-ish config, multiple tsconfigs per layer                                            |
| Linting     | ESLint 8 + @typescript-eslint                   | `eslint:recommended` + `@typescript-eslint/recommended`, `no-unused-vars` with `^_` ignore |
| Formatting  | Prettier                                        | no semi, single quotes, tab width 2, trailing comma es5, print width 80                    |
| Testing     | Jest + ts-jest                                  | Separate configs per layer, coverage scoped to business logic                              |
| Pre-commit  | Husky + lint-staged                             | Lint + format staged files, typecheck on commit                                            |
| Pre-push    | Husky                                           | Full test suite                                                                            |
| Test naming | `*.test.ts` / `*.spec.ts`                       | Co-located with source                                                                     |

## Proposed Approach

### Phase 1: TypeScript

- [x] Install: `typescript`, `@types/node`
- [x] Create `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "commonjs",
      "lib": ["ES2022"],
      "outDir": "dist",
      "rootDir": "src",
      "strict": true,
      "esModuleInterop": true,
      "allowSyntheticDefaultImports": true,
      "resolveJsonModule": true,
      "isolatedModules": true,
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true
    },
    "include": ["src/**/*"],
    "exclude": [
      "node_modules",
      "dist",
      "coverage",
      "**/*.test.ts",
      "**/*.spec.ts"
    ]
  }
  ```
- [x] Rename `src/index.js` → `src/index.ts` (and any other existing `.js` files)
- [x] Update `package.json`: set `"main": "dist/index.js"`
- [x] Add npm scripts: `build`, `typecheck`
  - `"build": "tsc"`
  - `"typecheck": "tsc --noEmit"`
  - Update `"start": "node dist/index.js"`
  - Update `"dev": "npx ts-node src/index.ts"` or use `tsx` for dev
- [x] Add `dist/` to `.gitignore`
- [x] Install type definitions: `@types/node` (Telegraf and Puppeteer ship their own types)

### Phase 2: ESLint + Prettier

- [x] Install: `eslint`, `prettier`, `eslint-config-prettier`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`
- [x] Create `.eslintrc.json`:
  ```json
  {
    "env": { "node": true, "es2021": true, "jest": true },
    "extends": [
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended",
      "prettier"
    ],
    "parser": "@typescript-eslint/parser",
    "parserOptions": { "ecmaVersion": "latest", "sourceType": "module" },
    "plugins": ["@typescript-eslint"],
    "rules": {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_" }
      ],
      "no-console": "off"
    },
    "overrides": [
      {
        "files": ["**/*.test.ts", "**/*.spec.ts"],
        "rules": {
          "@typescript-eslint/no-explicit-any": "off"
        }
      }
    ]
  }
  ```
- [x] Create `.prettierrc.json` — same style as music_production_suite:
  ```json
  {
    "semi": false,
    "singleQuote": true,
    "tabWidth": 2,
    "trailingComma": "es5",
    "printWidth": 80,
    "arrowParens": "always"
  }
  ```
- [x] Add npm scripts: `lint`, `lint:fix`, `prettier:check`, `prettier:fix`

### Phase 3: Jest + ts-jest

- [x] Install: `jest`, `ts-jest`, `@types/jest`
- [x] Create `jest.config.ts`:

  ```ts
  import type { Config } from 'jest'

  const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.spec.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.claude/'],
    collectCoverageFrom: [
      'src/**/*.ts',
      '!src/**/*.test.ts',
      '!src/**/*.spec.ts',
      '!src/index.ts',
    ],
    transform: {
      '^.+\\.ts$': [
        'ts-jest',
        {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            isolatedModules: true,
          },
        },
      ],
    },
    moduleFileExtensions: ['ts', 'js', 'json'],
    testTimeout: 10000,
  }

  export default config
  ```

- [x] Add npm scripts: `test`, `test:watch`, `test:coverage`

### Phase 4: Husky + lint-staged (git hooks)

- [x] Install: `husky`, `lint-staged`
- [x] Initialize husky: `npx husky init`
- [x] Create `.husky/pre-commit` — runs lint-staged + typecheck (matches music_production_suite):
  ```sh
  npx lint-staged
  npm run typecheck
  ```
- [x] Create `.husky/pre-push` — runs full test suite:
  ```sh
  npm test
  ```
- [x] Add `lint-staged` config to `package.json`:
  ```json
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
  ```
- [x] Add `prepare` script: `"prepare": "husky"`

### Phase 5: .gitignore update

- [x] Add `coverage/`, `dist/` to `.gitignore`

## Technical Decisions

| Decision                      | Choice                                  | Rationale                                                                       |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| TypeScript                    | Yes, strict mode                        | Matches music_production_suite; catches bugs early in bot logic and parser code |
| CommonJS module               | `"module": "commonjs"`                  | Current project uses CommonJS (`"type": "commonjs"` in package.json)            |
| Single tsconfig               | One `tsconfig.json`                     | Bot project has flat structure — no renderer/main split needed                  |
| Single Jest config            | One `jest.config.ts`                    | Same reason — single runtime target                                             |
| ESLint 8 + @typescript-eslint | Same versions as music_production_suite | Proven, stable setup                                                            |
| `eslint-config-prettier`      | Added (not in music_production_suite)   | Prevents ESLint/Prettier rule conflicts                                         |
| ts-jest                       | Yes                                     | Direct TS test execution, same as music_production_suite                        |
| Pre-commit typecheck          | Yes                                     | Matches music_production_suite pattern — catches type errors before they land   |

## File Structure

```
property-bot/
  tsconfig.json         ← NEW
  .eslintrc.json        ← NEW
  .prettierrc.json      ← NEW
  jest.config.ts        ← NEW
  .husky/
    pre-commit          ← NEW
    pre-push            ← NEW
  src/
    index.ts            ← RENAMED from .js
    bot/                ← .ts files
    parsers/            ← .ts files
  dist/                 ← BUILD OUTPUT (gitignored)
  package.json          ← MODIFIED (scripts, devDeps, lint-staged)
  .gitignore            ← MODIFIED
```

## Risks & Open Questions

- **Risk:** Puppeteer tests can be slow/flaky — **Mitigation:** Keep parser tests focused on HTML parsing logic (pass HTML strings to parser functions), not on actual page navigation. Reserve Puppeteer integration tests for a separate `test:e2e` script later.
- **Risk:** TypeScript migration of existing `.js` files — **Mitigation:** Project has no source files yet, so this is a clean start with zero migration cost.
- **Question:** Do you want to enforce a minimum coverage threshold? music_production_suite doesn't, but it's easy to add.
- **Question:** Prefer `tsx` or `ts-node` for the dev script? `tsx` is faster (uses esbuild), `ts-node` is more traditional.

## Acceptance Criteria

- [x] `npm run typecheck` passes with no errors
- [x] `npm run lint` reports clean
- [x] `npm run prettier:check` reports clean
- [x] `npm run build` produces output in `dist/`
- [x] `npm test` runs and passes (even if 0 tests initially)
- [x] Pre-commit hook blocks commits with lint/type errors
- [x] Pre-push hook blocks pushes with failing tests
