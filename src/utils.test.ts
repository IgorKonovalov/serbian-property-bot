import { escapeHtml, escapeUrl } from './utils'

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('escapes less-than and greater-than', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;')
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('a "b" c')).toBe('a &quot;b&quot; c')
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("a 'b' c")).toBe('a &#39;b&#39; c')
  })

  it('escapes all 5 characters in one string', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'
    )
  })

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('returns plain text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World')
  })
})

describe('escapeUrl', () => {
  it('escapes ampersands in valid http URLs', () => {
    expect(escapeUrl('http://example.com/?a=1&b=2')).toBe(
      'http://example.com/?a=1&amp;b=2'
    )
  })

  it('escapes ampersands in valid https URLs', () => {
    expect(escapeUrl('https://example.com/?a=1&b=2')).toBe(
      'https://example.com/?a=1&amp;b=2'
    )
  })

  it('escapes double quotes in URLs', () => {
    expect(escapeUrl('https://example.com/?q="test"')).toBe(
      'https://example.com/?q=&quot;test&quot;'
    )
  })

  it('rejects javascript: URLs', () => {
    expect(escapeUrl('javascript:alert(1)')).toBe('')
  })

  it('rejects data: URLs', () => {
    expect(escapeUrl('data:text/html,<h1>hi</h1>')).toBe('')
  })

  it('rejects invalid URLs', () => {
    expect(escapeUrl('not a url')).toBe('')
  })

  it('returns empty string for empty input', () => {
    expect(escapeUrl('')).toBe('')
  })
})
