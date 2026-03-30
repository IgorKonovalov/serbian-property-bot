import { escapeHtml } from './utils'

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('escapes less-than', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;')
  })

  it('escapes greater-than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b')
  })

  it('escapes all characters in one string', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      '&lt;a href="x"&gt;&amp;&lt;/a&gt;'
    )
  })

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('returns plain text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World')
  })
})
