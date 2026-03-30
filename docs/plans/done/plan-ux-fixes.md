# Plan: Telegram Bot UX Fixes

**Date:** 2026-03-30
**Status:** Completed

## Goal

Fix 14 UX issues found during Telegram bot review — 3 broken (crash/data-corruption), 5 confusing, 6 improvable — plus add an interactive help system.

## Current State

All 5 commands (`/start`, `/search`, `/profiles`, `/favorites`, `/digest`) are functional but have UX bugs ranging from potential Telegram API errors (callback_data overflow) to missing pagination and unsafe delete actions.

## Proposed Approach

### Phase 1: Critical Fixes (broken behavior)

**1.1 — Fix callback_data overflow and regex ambiguity (`search.ts`)**

- Replace `save_${source}_${externalId}` with `save_${listing.dbId}` where `dbId` is the integer `listings.id` from the database
- This requires `upsertListing` to run before building results keyboard (already the case — `search.ts:196-198` upserts all results before rendering)
- Store a `Map<externalId, dbId>` in search state during result rendering, or look up from DB
- Approach: after upserting, attach `dbId` to each result. Simplest: extend the in-memory results array items with a `dbId` field
- Change save handler regex to `/^save_(\d+)$/` — clean, unambiguous, always short
- Update handler to look up listing by `id` instead of `source + external_id`

Files: `search.ts`, `messages.ts` (no change needed)

**1.2 — Fix text handler collision (`search.ts`, `profiles.ts`)**

- Add a `phase` field to `SearchState`: `'selecting' | 'entering_area' | 'browsing'`
- Set `phase = 'selecting'` on `/search` entry
- Set `phase = 'entering_area'` after pressing "Search" button
- Set `phase = 'browsing'` after results are displayed
- In the text handler (`search.ts:169`), only process text when `phase === 'entering_area'` (replaces the current `!state.results` check)
- This prevents the search handler from catching text when the user is in profile-creation mode, even if stale search state exists

Files: `search.ts`

### Phase 2: Confusing UX (should fix)

**2.1 — Add cancel to profile wizard (`profiles.ts`, `messages.ts`)**

- At each text-input step (name, keywords, filters), send a message with an inline "Отмена" button alongside the prompt
- Callback data: `prof_cancel`
- Handler: clears `userStates` for the user, sends "Отменено" toast via `answerCbQuery`, shows profile list
- Add messages: `profilesCancel: '✕ Отмена'`, `profilesCancelled: 'Отменено.'`

Files: `profiles.ts`, `messages.ts`

**2.2 — Clean up search state after results (`search.ts`)**

- Delete search state from `userStates` after entering browsing phase + a 30-minute TTL is impractical without timers
- Simpler: delete state when user starts any new command (`/search`, `/profiles`, `/favorites`, `/digest`). Each command's entry already overwrites state — just ensure it explicitly deletes from the search map
- Even simpler: the phase fix from 1.2 already prevents the collision. Just add explicit cleanup: delete search state when user runs `/search` again (already happens via overwrite) or `/profiles` (add `searchUserStates.delete(telegramId)` at profiles command entry)
- Best approach: export `searchUserStates` from `search.ts` and call `.delete()` in `profiles.ts` text handler preamble, OR centralize cleanup in a shared middleware
- Decision: keep it simple — in the search text handler, the `phase === 'entering_area'` guard (from 1.2) is sufficient. No cross-module imports needed. The stale state is harmless once the phase guard is in place.

Files: `search.ts` (already addressed by 1.2)

**2.3 — Add delete confirmation for profiles (`profiles.ts`, `messages.ts`)**

- Change `prof_del_{id}` to show a confirmation message: "Удалить профиль «{name}»?" with [Да, удалить] and [Отмена] buttons
- Callback data: `prof_delok_{id}` (confirm), `prof_list` (cancel — already exists)
- Move actual deletion logic from `prof_del_` handler to `prof_delok_` handler
- Add messages: `profilesConfirmDelete(name: string)` function returning confirmation text

Files: `profiles.ts`, `messages.ts`

**2.4 — Add digest error message (`messages.ts`, `digest.ts`)**

- Add `digestFailed: 'Ошибка при сборке дайджеста. Попробуйте позже.'` to messages
- Replace `messages.searchFailed` with `messages.digestFailed` in `digest.ts:26`

Files: `messages.ts`, `digest.ts`

**2.5 — Add favorites pagination (`favorites.ts`, `messages.ts`)**

- Reuse the same pagination pattern as search results: `FAVORITES_PER_PAGE = 5`
- Store page state in a `Map<telegramId, number>` (page index only — favorites are fetched from DB each time)
- Callback data: `fpage_{page}` for pagination
- Rewrite `buildFavoritesMessage` to accept a `page` parameter
- Add prev/next buttons like search results
- Clean up page state when user leaves favorites or page state is missing (default to page 0)

Files: `favorites.ts`

### Phase 3: Polish (improvable)

**3.1 — Remove delete button from profile list (`profiles.ts`)**

- Change profile list keyboard: each row has only the profile name button `prof_view_{id}`
- Delete is only accessible from the detail view (already exists there)
- Keep the `+ Добавить профиль` button at the bottom

Files: `profiles.ts`

**3.2 — Add "Run" button to profile detail view (`profiles.ts`, `search.ts`)**

- Add a `▶ Запустить` button to the profile detail keyboard
- Callback data: `prof_run_{id}`
- Handler: sets up search state with this single profile pre-selected, then asks for area (same flow as search after profile selection)
- This requires importing/sharing the search state setup logic. Approach: have `prof_run_{id}` handler create a search state with the profile pre-selected, set phase to `entering_area`, and reply with the "enter area" prompt
- Export a `startSearchWithProfiles(telegramId, profiles, phase)` helper from `search.ts`

Files: `profiles.ts`, `search.ts`

**3.3 — Make source a clickable link in results (`messages.ts`)**

- Change `resultCard` to include the listing URL as an HTML link: `<a href="${url}">${source}</a>`
- Switch all result messages to `parse_mode: 'HTML'` (more reliable than Markdown for user-generated content)
- Update `search.ts` to pass `parse_mode: 'HTML'` when sending/editing result messages
- Also update `favorites.ts` to use the same HTML format

Files: `messages.ts`, `search.ts`, `favorites.ts`

**3.4 — Add interactive help system (`help.ts`, `start.ts`, `messages.ts`)**

Entry points:

- `❓ Помощь` inline button on the `/start` welcome message
- `/help` command (registered with BotFather)

Flow:

```
/help (or tap "❓ Помощь" on /start)
  -> [Message: help intro] [Keyboard: topic buttons]
     🔍 Поиск
     📋 Профили
     ⭐ Избранное
     📊 Дайджест
     -> User taps "🔍 Поиск"
        -> [editMessageText: step-by-step search walkthrough]
           [Keyboard: « Назад к помощи]
     -> User taps "📋 Профили"
        -> [editMessageText: step-by-step profiles walkthrough]
           [Keyboard: « Назад к помощи]
     -> ... (same for each topic)
     -> User taps "« Назад к помощи"
        -> [editMessageText: help intro + topic buttons]
```

Help topics content (all in Russian, step-by-step):

**🔍 Поиск** — how to search for properties:

1. Откройте /search
2. Выберите один или несколько профилей поиска (✓/✗)
3. Нажмите «Искать»
4. Введите район или город (на сербском, например "Novi Sad")
5. Просматривайте результаты, листайте страницы
6. Нажмите «Сохранить» чтобы добавить в избранное

**📋 Профили** — how to manage search profiles:

1. Откройте /profiles
2. Нажмите на профиль чтобы просмотреть детали
3. Используйте «Изменить» или «Удалить»
4. Нажмите «+ Добавить профиль» для создания нового
5. Введите название, ключевые слова (на сербском) и фильтры
6. Профили используются в поиске и ежедневном дайджесте

**⭐ Избранное** — how to use favorites:

1. Сохраняйте объявления кнопкой «Сохранить» в результатах поиска
2. Откройте /favorites чтобы просмотреть сохранённые
3. Нажмите «Открыть» для перехода на сайт
4. Нажмите «Удалить» чтобы убрать из избранного
5. Бот отслеживает изменения цен на сохранённые объявления

**📊 Дайджест** — how digest works:

1. Каждое утро в 08:00 бот проверяет все сайты
2. Если цены на избранные объявления изменились — вы получите уведомление
3. Новые объявления по вашим профилям тоже попадают в дайджест
4. Откройте /digest чтобы получить дайджест прямо сейчас
5. Если изменений нет — бот не беспокоит

Implementation:

- New file `src/bot/commands/help.ts` — registers `/help` command and all `help_*` callback handlers
- Callback data: `help_search`, `help_profiles`, `help_favorites`, `help_digest`, `help_back`
- All strings in `messages.ts`: `helpIntro`, `helpSearch`, `helpProfiles`, `helpFavorites`, `helpDigest`, `helpButton`, `helpBack`
- Update `/start` in `start.ts`: add inline keyboard with single `❓ Помощь` button (callback: `help_show`)
- The `help_show` callback is handled in `help.ts` — sends help intro as a new message (since start message may be old)
- Improve welcome message: expand `/digest` line to `/digest — Дайджест: изменения цен, новые объявления`

Files: `help.ts` (new), `start.ts`, `messages.ts`

**3.5 — Consistent HTML parse mode everywhere (`messages.ts`, `profiles.ts`)**

- Switch profile detail from Markdown `*bold*` to HTML `<b>bold</b>`
- Use `parse_mode: 'HTML'` consistently across all commands
- This eliminates the risk of Markdown breaking on special chars in profile names/keywords
- Update `formatProfile` to use HTML tags

Files: `profiles.ts`, `messages.ts`

**3.6 — Unified button & emoji system (all commands)**

Standardize all button labels, emoji usage, and navigation patterns across the bot.

**Action buttons — every action gets a consistent emoji prefix:**

| Action         | Button label          | Used in                            |
| -------------- | --------------------- | ---------------------------------- |
| Search         | `🔍 Искать`           | search profile selection           |
| Save           | `⭐ Сохранить`        | search results                     |
| Open link      | `🔗 Открыть`          | search results, favorites          |
| Add profile    | `➕ Добавить профиль` | profile list                       |
| Edit           | `✏️ Изменить`         | profile detail                     |
| Delete         | `🗑 Удалить`          | profile detail, favorites          |
| Confirm delete | `🗑 Да, удалить`      | delete confirmation                |
| Run search     | `▶️ Запустить`        | profile detail                     |
| Already saved  | `✅ Сохранено`        | search results (after save)        |
| Cancel         | `✕ Отмена`            | wizard cancel, delete confirmation |
| Help           | `❓ Помощь`           | welcome message                    |

**Navigation vs pagination — visually distinct:**

| Purpose         | Button label              | Example                      |
| --------------- | ------------------------- | ---------------------------- |
| Pagination prev | `◀ Назад`                 | search results, favorites    |
| Pagination next | `Далее ▶`                 | search results, favorites    |
| Navigate back   | `« Назад к [destination]` | `« К профилям`, `« К помощи` |

Rule: pagination uses filled arrows (`◀`/`▶`), navigation uses guillemets (`«`). Pagination buttons always in their own row together. Back navigation always in its own row at the bottom.

**Search profile toggles — high-contrast icons:**

- Selected: `✅ Profile Name`
- Unselected: `◻️ Profile Name`

(Replaces current `✓`/`✗` which are small and hard to distinguish on mobile)

**Profile list items — scannable with emoji:**

- Each profile row: `📌 Profile Name`
- Bottom row: `➕ Добавить профиль`

**Welcome message — clean, scannable layout:**

```
🏠 Property Bot

Я помогу найти недвижимость в Сербии.

🔍 /search — Поиск недвижимости
📋 /profiles — Профили поиска
⭐ /favorites — Избранное
📊 /digest — Изменения цен и новые объявления

                [❓ Помощь]
```

**Help topic buttons — 2x2 grid:**

```
[🔍 Поиск]      [📋 Профили]
[⭐ Избранное]   [📊 Дайджест]
```

(Compact on mobile, matches emoji from welcome message for recognition)

**Delete confirmation layout:**

```
Удалить профиль «Name»?

[🗑 Да, удалить]  [✕ Отмена]
```

(Side by side, destructive action on left, cancel on right — standard pattern)

**Favorites bulk clear confirmation:**

```
Удалить все N избранных?

[🗑 Да, удалить все]  [✕ Отмена]
```

Implementation:

- Update all button labels in `messages.ts` to match the table above
- Update `buildProfileKeyboard` in `search.ts`: `✅`/`◻️` toggle
- Update `buildProfileListKeyboard` in `profiles.ts`: `📌` prefix
- Update pagination buttons in `search.ts` and `favorites.ts`: `◀`/`▶`
- Update all "back" buttons: `« Назад к [destination]`
- Update welcome message in `messages.ts`
- Update help keyboard layout in `help.ts`: 2x2 grid

Files: `messages.ts`, `search.ts`, `profiles.ts`, `favorites.ts`, `help.ts`

**3.7 — Save button visual feedback (`search.ts`, `messages.ts`)**

After tapping `⭐ Сохранить`, the button changes in-place to `✅ Сохранено`:

```
Before:  [🔗 Открыть] [⭐ Сохранить]
After:   [🔗 Открыть] [✅ Сохранено]
```

- Save handler calls `ctx.editMessageReplyMarkup()` with rebuilt keyboard for the current page
- The saved listing's row swaps `⭐ Сохранить` (callback `save_{id}`) → `✅ Сохранено` (callback `saved_{id}`)
- `saved_{id}` handler is a no-op: just `ctx.answerCbQuery('Уже в избранном')` toast
- To know which listings are already saved, query favorites for the user before rebuilding the keyboard, or track saved IDs in search state
- Simpler approach: after save, store the saved `dbId` in a `Set<number>` on the search state. `buildResultsKeyboard` checks this set to decide which button label to show.

Files: `search.ts`, `messages.ts`

**3.8 — Bulk clear favorites (optional)**

- Add a "Очистить всё" button at the bottom of favorites list (only when count > 3)
- With confirmation: "Удалить все N избранных?" [Да] [Отмена]
- Callback data: `fav_clearall`, `fav_clearok`
- Add `clearAllFavorites(userId)` to `db/queries/favorites.ts`
- Add messages: `favoritesClearAll`, `favoritesClearConfirm(count)`, `favoritesCleared`

Files: `favorites.ts`, `messages.ts`, `db/queries/favorites.ts`

## Technical Decisions

| Decision               | Choice                                                | Rationale                                                                                                 |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Save button uses DB id | `save_{dbId}` instead of `save_{source}_{externalId}` | Guarantees < 64 bytes, no parsing ambiguity, listings are already in DB before rendering                  |
| Text collision fix     | Phase guard in search state                           | Simpler than cross-module state cleanup or shared middleware; no new dependencies                         |
| HTML over Markdown     | `parse_mode: 'HTML'` everywhere                       | More predictable escaping, no risk from `*_` in user content, aligns with architecture plan's HTML format |
| Favorites pagination   | In-memory page map + DB fetch per page                | Favorites list is small enough to query each time; avoids stale cached data                               |
| Delete confirmation    | Two-step callback (prof_del → prof_delok)             | Minimal UI change, prevents accidental deletion                                                           |

## File Changes Summary

```
src/bot/
  messages.ts              — add digest error, cancel, delete confirm, help topics, HTML format
  commands/
    start.ts               — add "❓ Помощь" inline button to welcome message
    search.ts              — phase field, DB id for save, export helper for prof_run
    profiles.ts            — cancel flow, delete confirm, remove list delete, run button, HTML
    favorites.ts           — pagination, bulk clear, HTML format
    digest.ts              — use digestFailed message
    help.ts                — NEW: /help command + topic menu with step-by-step walkthroughs
```

## Risks & Open Questions

- **Risk:** Switching to `save_{dbId}` means old inline keyboards (sent before the change) will have the old `save_source_externalId` format — **Mitigation:** Keep the old `save_(.+)_(.+)` handler as a fallback for a transition period, or accept that old buttons will fail gracefully with "listing not found"
- **Risk:** HTML parse mode requires escaping `<`, `>`, `&` in user-generated content (profile names, listing titles) — **Mitigation:** Add a simple `escapeHtml()` utility, apply to all dynamic strings in messages
- **Question:** Should phase 3.6 (bulk clear favorites) be included or deferred? It's the lowest-priority item.

## Acceptance Criteria

- [x] Save button callback*data is always under 64 bytes (`save*{integer}`)
- [x] Typing text while in profile wizard never triggers search handler
- [x] Profile add/edit wizard has a cancel button at every step
- [x] Deleting a profile requires confirmation
- [x] Digest failure shows its own error message (not "search error")
- [x] Favorites paginate at 5 per page with prev/next buttons
- [x] Profile list shows only name (no inline delete button)
- [x] Profile detail has a "Run search" shortcut button
- [x] Source name in results is a clickable link (HTML)
- [x] All messages use `parse_mode: 'HTML'` consistently
- [x] All action buttons have consistent emoji prefixes per the button table
- [x] Pagination uses `◀`/`▶`, navigation back uses `« Назад к ...`
- [x] Search profile toggles use `✅`/`◻️`
- [x] Profile list items prefixed with `📌`
- [x] Welcome message is clean/scannable with emoji per command line and "❓ Помощь" button
- [x] Save button changes to `✅ Сохранено` after tapping, with "Уже в избранном" toast on re-tap
- [x] `/help` command shows topic menu with 4 topics
- [x] Each help topic shows step-by-step walkthrough in Russian
- [x] "Назад к помощи" returns to topic menu
- [x] Old save buttons from before the migration fail gracefully (not crash)
