# CLAUDE.md

## Commit Message Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` — new feature
- `fix` — bug fix
- `refactor` — code change that neither fixes a bug nor adds a feature
- `docs` — documentation only
- `test` — adding or updating tests
- `chore` — build, tooling, config, dependencies
- `style` — formatting, whitespace (no logic change)
- `perf` — performance improvement
- `ci` — CI/CD changes

### Scopes

Use the primary area affected: `bot`, `parsers`, `services`, `types`, `utils`, `config`, `deps`.

### Rules

- Subject line: imperative mood, lowercase, no period, max 72 chars
- Body: wrap at 72 chars, explain **why** not **what**
- Footer: reference issues (`Closes #123`) or note breaking changes (`BREAKING CHANGE:`)
- One logical change per commit — don't mix unrelated changes

### Examples

```
feat(bot): add /search command for property lookup

fix(parsers): handle missing price field on halooglasi listings

chore(deps): upgrade puppeteer to v24

refactor(services): extract result formatting into dedicated module

test(parsers): add unit tests for nekretnine parser
```
