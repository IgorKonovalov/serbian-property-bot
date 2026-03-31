import { messages } from './messages'

describe('resultHeader', () => {
  it('formats range and total', () => {
    expect(messages.resultHeader(1, 5, 20)).toBe('Показано 1-5 из 20')
  })
})

describe('resultCard', () => {
  it('formats a full listing card', () => {
    const card = messages.resultCard(
      1,
      'Beautiful house in Centar',
      3,
      65,
      10,
      120000,
      'Beograd',
      'Centar',
      'halooglasi',
      'https://example.com/1'
    )
    expect(card).toContain('1.')
    expect(card).toContain('3 комн.')
    expect(card).toContain('65м²')
    expect(card).toContain('120')
    expect(card).toContain('Beautiful house in Centar')
    expect(card).toContain('10 ар')
    expect(card).toContain('Beograd, Centar')
    expect(card).toContain('halooglasi')
    expect(card).toContain('https://example.com/1')
  })

  it('handles null rooms', () => {
    const card = messages.resultCard(
      1,
      'Test',
      null,
      50,
      null,
      80000,
      'Novi Sad',
      null,
      'test',
      'http://x'
    )
    expect(card).not.toContain('комн.')
    expect(card).toContain('50м²')
  })

  it('handles null size', () => {
    const card = messages.resultCard(
      1,
      'Test',
      2,
      null,
      null,
      80000,
      'Novi Sad',
      null,
      'test',
      'http://x'
    )
    expect(card).not.toContain('м²')
  })

  it('shows fallback when price is null', () => {
    const card = messages.resultCard(
      1,
      'Test',
      2,
      50,
      null,
      null,
      'Novi Sad',
      null,
      'test',
      'http://x'
    )
    expect(card).toContain('Цена не указана')
  })

  it('shows Н/Д when city and area are null', () => {
    const card = messages.resultCard(
      1,
      'Test',
      2,
      50,
      null,
      80000,
      null,
      null,
      'test',
      'http://x'
    )
    expect(card).toContain('Н/Д')
  })

  it('escapes HTML in location and title', () => {
    const card = messages.resultCard(
      1,
      '<script>alert</script>',
      2,
      50,
      null,
      80000,
      '<script>',
      null,
      'test',
      'http://x'
    )
    expect(card).toContain('&lt;script&gt;')
    expect(card).not.toContain('<script>')
  })

  it('handles null title', () => {
    const card = messages.resultCard(
      1,
      null,
      2,
      50,
      null,
      80000,
      'Beograd',
      null,
      'test',
      'http://x'
    )
    expect(card).toContain('Beograd')
    expect(card).not.toContain('undefined')
  })

  it('hides plot size when null', () => {
    const card = messages.resultCard(
      1,
      'Test',
      2,
      50,
      null,
      80000,
      'NS',
      null,
      'test',
      'http://x'
    )
    expect(card).not.toContain('ар')
  })
})

describe('detailCaption', () => {
  it('formats full detail caption', () => {
    const caption = messages.detailCaption(
      'Beautiful house',
      4,
      120,
      250000,
      'Beograd',
      'Vračar',
      15,
      'nekretnine',
      'https://example.com/2'
    )
    expect(caption).toContain('Beautiful house')
    expect(caption).toContain('4 комн.')
    expect(caption).toContain('120м²')
    expect(caption).toContain('250')
    expect(caption).toContain('Beograd, Vračar')
    expect(caption).toContain('Участок: 15 ари')
    expect(caption).toContain('nekretnine')
  })

  it('handles null title', () => {
    const caption = messages.detailCaption(
      null,
      2,
      50,
      80000,
      'NS',
      null,
      null,
      's',
      'http://x'
    )
    expect(caption).toContain('Без названия')
  })

  it('hides plot size when null', () => {
    const caption = messages.detailCaption(
      'T',
      2,
      50,
      80000,
      'NS',
      null,
      null,
      's',
      'http://x'
    )
    expect(caption).not.toContain('Участок')
  })

  it('escapes HTML in title', () => {
    const caption = messages.detailCaption(
      '<b>XSS</b>',
      2,
      50,
      80000,
      'NS',
      null,
      null,
      's',
      'http://x'
    )
    expect(caption).toContain('&lt;b&gt;XSS&lt;/b&gt;')
  })
})

describe('formatProfile', () => {
  it('formats profile with all filters', () => {
    const text = messages.formatProfile({
      name: 'Test Profile',
      keywords: 'kuća',
      min_price: 50000,
      max_price: 200000,
      min_size: 40,
      max_size: 120,
      min_plot_size: 10,
    })
    expect(text).toContain('Test Profile')
    expect(text).toContain('kuća')
    expect(text).toContain('€50000-200000')
    expect(text).toContain('40−120м²')
    expect(text).toContain('от 10 ар')
  })

  it('formats profile without filters', () => {
    const text = messages.formatProfile({
      name: 'Simple',
      keywords: 'stan',
      min_price: null,
      max_price: null,
      min_size: null,
      max_size: null,
      min_plot_size: null,
    })
    expect(text).toContain('Simple')
    expect(text).toContain('stan')
    expect(text).not.toContain('Фильтры')
  })

  it('shows partial price filter with ellipsis', () => {
    const text = messages.formatProfile({
      name: 'T',
      keywords: 'k',
      min_price: null,
      max_price: 100000,
      min_size: null,
      max_size: null,
      min_plot_size: null,
    })
    expect(text).toContain('€...-100000')
  })

  it('shows partial size filter with ellipsis', () => {
    const text = messages.formatProfile({
      name: 'T',
      keywords: 'k',
      min_price: null,
      max_price: null,
      min_size: 50,
      max_size: null,
      min_plot_size: null,
    })
    expect(text).toContain('50−...м²')
  })

  it('shows size filter with only max', () => {
    const text = messages.formatProfile({
      name: 'T',
      keywords: 'k',
      min_price: null,
      max_price: null,
      min_size: null,
      max_size: 120,
      min_plot_size: null,
    })
    expect(text).toContain('...−120м²')
  })

  it('escapes HTML in name and keywords', () => {
    const text = messages.formatProfile({
      name: '<b>Bold</b>',
      keywords: 'a & b',
      min_price: null,
      max_price: null,
      min_size: null,
      max_size: null,
      min_plot_size: null,
    })
    expect(text).toContain('&lt;b&gt;Bold&lt;/b&gt;')
    expect(text).toContain('a &amp; b')
  })
})

describe('function message properties', () => {
  it('profilesEnterKeywords escapes HTML', () => {
    const msg = messages.profilesEnterKeywords('<test>')
    expect(msg).toContain('&lt;test&gt;')
  })

  it('profilesConfirmDelete escapes HTML', () => {
    const msg = messages.profilesConfirmDelete('<profile>')
    expect(msg).toContain('&lt;profile&gt;')
  })

  it('favoritesClearConfirm includes count', () => {
    const msg = messages.favoritesClearConfirm(5)
    expect(msg).toContain('5')
  })

  it('digestNewButton includes count and date', () => {
    const btn = messages.digestNewButton(10, '30.03')
    expect(btn).toContain('10')
    expect(btn).toContain('30.03')
  })

  it('digestPriceButton includes count', () => {
    const btn = messages.digestPriceButton(3)
    expect(btn).toContain('3')
  })
})
