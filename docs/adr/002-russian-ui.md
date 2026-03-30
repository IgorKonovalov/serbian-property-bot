# ADR-002: Russian Language for Bot UI

**Date:** 2026-03-30
**Status:** Accepted

## Context

The bot's users (~5 people) are Russian-speaking. The bot searches Serbian property sites, so search keywords are in Serbian, but all bot interaction (commands, messages, buttons, prompts) should be in Russian for comfortable daily use.

## Options Considered

### Option A: English UI

- Pros: Default for most bot tutorials, no translation effort
- Cons: Users are Russian-speaking, feels impersonal

### Option B: Fully Russian (including transliterated commands)

- Pros: Fully native feel
- Cons: Transliterated commands look awkward (`/daidzhest`), harder to type and remember

### Option C: English commands, Russian text

- Pros: Commands are clean and standard (`/search`, `/favorites`), all messages/buttons/prompts in Russian
- Cons: Mixed language (minor — commands are short and universal)

## Decision

English commands, Russian for everything else:

| Command      | Bot responds in Russian         |
| ------------ | ------------------------------- |
| `/start`     | Приветствие + список команд     |
| `/search`    | Профили, кнопки, результаты     |
| `/profiles`  | Управление профилями            |
| `/favorites` | Список избранного               |
| `/digest`    | Дайджест цен и новых объявлений |

All bot messages, inline button labels, prompts, and digest text are in Russian. Search keywords (profile content) remain in Serbian since they're passed directly to Serbian property sites.

All Russian strings are centralized in `src/bot/messages.ts` for easy maintenance.

## Consequences

- All user-facing text (messages, buttons, prompts) in Russian
- Commands stay in English — clean, standard, easy to type
- Search profile keywords stay in Serbian (site queries)
- `messages.ts` acts as a single source of truth for all UI strings
