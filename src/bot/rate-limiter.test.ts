import { rateLimiter } from './rate-limiter'

describe('rateLimiter', () => {
  const middleware = rateLimiter()

  function makeCtx(userId: number, text?: string) {
    return {
      from: { id: userId },
      message: text ? { text } : undefined,
      callbackQuery: undefined,
      answerCbQuery: jest.fn(),
    }
  }

  it('allows requests under the limit', async () => {
    const ctx = makeCtx(9001, '/search')
    const next = jest.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await middleware(ctx as any, next)
    expect(next).toHaveBeenCalled()
  })

  it('allows /start and /help without counting', async () => {
    const next = jest.fn()
    const ctxStart = makeCtx(9002, '/start')
    const ctxHelp = makeCtx(9002, '/help')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await middleware(ctxStart as any, next)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await middleware(ctxHelp as any, next)
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('blocks after exceeding max requests', async () => {
    const userId = 9003
    const next = jest.fn()

    // Send 31 requests (limit is 30)
    for (let i = 0; i < 31; i++) {
      const ctx = makeCtx(userId, '/search')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await middleware(ctx as any, next)
    }

    // next should have been called 30 times (not 31)
    expect(next).toHaveBeenCalledTimes(30)
  })

  it('allows requests without from field', async () => {
    const ctx = { from: undefined, message: undefined, callbackQuery: undefined }
    const next = jest.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await middleware(ctx as any, next)
    expect(next).toHaveBeenCalled()
  })
})
