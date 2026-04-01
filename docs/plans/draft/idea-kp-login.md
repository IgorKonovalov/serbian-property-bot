# Idea: KupujemProdajem Login (Optional Auth)

**Date:** 2026-03-30
**Status:** Draft — not planned for implementation

## Why

Login is NOT required for searching KP, but provides:

- Access to seller contact info
- Ability to message sellers directly
- Potentially higher rate limits / less blocking
- Access to user's KP favorites and saved searches

## Proposed Approach

### Credential Collection

Bot collects email/password via wizard-style text input in `/settings`:

```
/settings -> 🔑 Войти в KP
  -> "Введите email от KupujemProdajem:"
     -> User types email
        -> "Введите пароль:"
           -> User types password
              -> Bot attempts login via HTTP POST
              -> Success: "✅ Вход выполнен! Сессия сохранена."
              -> Failure: "❌ Не удалось войти. Проверьте данные."
     -> ✕ Отмена (cancel at any step)
```

Password message deleted from chat immediately after reading.

### Session Storage

- Store session cookies in `user_settings` (key: `kp_session`, value: JSON cookie string)
- Password is NOT stored — only the session cookie
- Sessions expire — fall back to anonymous search on expiry

### Parser Interface Changes

Add optional `setUserContext` method to `Parser` interface:

```typescript
interface Parser {
  readonly source: string
  search(params: SearchParams): Promise<Listing[]>
  setUserContext?(userId: number): void // for auth-aware parsers
}
```

Registry calls `parser.setUserContext(userId)` before `parser.search()` if the method exists. KP parser uses this to load session cookies from DB.

### Settings UI

- Show connection status: `🔑 KupujemProdajem: подключено ✅` or `не подключено`
- "Выйти" (logout) button to clear stored session

## Open Questions

- Should credentials be collected in bot chat, or via a web-based OAuth flow? Chat is simpler but password is briefly visible in chat history.
- KP login endpoint may change or add CAPTCHA — anonymous search is always the fallback.
- Storing session cookies in plaintext DB — sessions are temporary tokens, DB is local/server-only, but could encrypt with a server-side key for extra security.
