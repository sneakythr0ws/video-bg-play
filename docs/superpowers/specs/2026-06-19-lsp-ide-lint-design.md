# LSP / IDE / Lint Support for video-bg-play

## Overview

Add lightweight but complete development tooling to the `video-bg-play` Firefox extension project: ESLint for JS diagnostics, Prettier for formatting, `web-ext lint` for WebExtension manifest/package validation, IDE-specific settings, and OpenCode integration so the agent can run these checks automatically.

## Goals

- Provide IDE support (IntelliJ IDEA / WebStorm via `.idea` settings) for JavaScript and JSON.
- Enforce consistent code style with ESLint and Prettier.
- Validate the extension package with `web-ext lint`.
- Expose a single command (`make check`) that runs lint, format check, and validation.
- Configure OpenCode so it knows how to run these commands and understands project conventions.
- Keep the project simple: no TypeScript, no bundler, no CI pipeline for now.

## Non-goals

- Migrate to Manifest V3.
- Add a test framework or CI/CD.
- Convert the content script to a module or TypeScript.
- Add pre-commit hooks.

## Project Context

- Firefox WebExtension using Manifest V2.
- Single content script: `video-bg-play-content.js`.
- No build step; packaging via `Makefile` → `video-bg-play.xpi`.
- No existing `package.json`, ESLint, Prettier, or npm dependencies.

## Components

### 1. `package.json`

Defines dev dependencies and npm scripts:

- `lint` — `eslint .`
- `lint:fix` — `eslint . --fix`
- `format` — `prettier --write .`
- `format:check` — `prettier --check .`
- `validate` — `web-ext lint`
- `check` — `npm run lint && npm run format:check && npm run validate`

Dependencies:

- `eslint`
- `prettier`
- `web-ext`

### 2. ESLint (`.eslintrc.json`)

- Extends `eslint:recommended`.
- Environments: `browser`, `webextensions`, `es2022`.
- `parserOptions.ecmaVersion`: `latest`.
- `sourceType`: `script` (content script is not an ES module).
- Additional rules:
  - `no-unused-vars`: `warn`
  - `eqeqeq`: `error`

### 3. Prettier (`.prettierrc.json`)

```json
{
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### 4. `.gitignore`

Add:

- `node_modules/`
- `web-ext-artifacts/`
- `*.log`

### 5. `Makefile`

Add targets:

- `lint` → `npm run lint`
- `fix` → `npm run lint:fix && npm run format`
- `format` → `npm run format`
- `validate` → `npm run validate`
- `check` → `npm run check`

Keep existing `video-bg-play.zip` / `video-bg-play.xpi` target.

### 6. `opencode.json`

Provide OpenCode with:

- Project context (Firefox WebExtension, Manifest V2, content script, no build step).
- Available commands: `check`, `lint`, `lint:fix`, `format`, `validate`.
- Style notes: vanilla JS, single quotes, Prettier/ESLint enforced.

### 7. `.idea` project settings

Add project-level configuration files so IntelliJ IDEA/WebStorm automatically:

- Enables ESLint.
- Uses project Prettier configuration.
- Applies project code style on save.

Do not expose personal IDE state (window layout, run configurations tied to local paths).

## Migration

1. Run `npm install`.
2. Run `npm run fix` to auto-format and auto-fix the existing content script.
3. Run `npm run validate` and confirm only expected Manifest V2 deprecation warnings remain.
4. Run `make check` to confirm the full verification pipeline passes.

## Verification

- `make check` exits with code 0.
- `web-ext lint` completes (warnings about Manifest V2 deprecation are expected and acceptable).
- The packaged `.xpi` still contains the same files and works in Firefox for Android.

## Trade-offs

- Adding npm means `node_modules` and `package-lock.json`, but gives real lint/format/validation instead of IDE-only hints.
- Manifest V2 deprecation warnings from `web-ext lint` are accepted because the extension still targets Firefox for Android, where V3 support may be incomplete.
