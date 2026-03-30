export const messages = {
  welcome:
    'Добро пожаловать в Property Bot! 🏠\n\n' +
    'Я помогу найти недвижимость на сербских сайтах.\n\n' +
    'Доступные команды:\n' +
    '/search — Поиск недвижимости\n' +
    '/profiles — Управление профилями поиска\n' +
    '/favorites — Сохранённые объявления\n' +
    '/digest — Изменения цен и новые объявления',

  searchSelectProfiles: 'Выберите профили поиска (нажмите для переключения):',
  searchEnterArea: 'Введите район/город (например "Novi Sad", "Beograd"):',
  searchNoProfiles: 'У вас нет профилей поиска. Создайте через /profiles.',
  searchSelectAtLeast: 'Выберите хотя бы один профиль!',
  searchSessionExpired: 'Сессия истекла. Используйте /search заново.',
  searchSearching: '🔍 Ищу...',
  searchNoResults: 'Ничего не найдено. Попробуйте другие профили или район.',
  searchFailed: 'Ошибка поиска. Попробуйте позже.',
  searchSaved: '⭐ Сохранено в избранное!',
  searchListingNotFound: 'Объявление не найдено в базе.',

  // Profiles
  profilesList: '📋 Ваши профили поиска:',
  profilesEmpty:
    'У вас нет профилей поиска. Нажмите кнопку ниже, чтобы добавить.',
  profilesAdd: '+ Добавить профиль',
  profilesRun: 'Запустить',
  profilesEdit: 'Изменить',
  profilesDelete: 'Удалить',
  profilesDeleted: 'Профиль удалён.',
  profilesNotFound: 'Профиль не найден.',
  profilesEnterName: 'Введите название профиля:',
  profilesEnterKeywords(defaultName: string): string {
    return (
      'Введите ключевые слова для поиска (на сербском).\n' +
      `Или отправьте "-" чтобы использовать название: "${defaultName}"`
    )
  },
  profilesEnterFilters:
    'Введите фильтры (необязательно, формат: цена_от-цена_до, м²_от-м²_до, плац_от).\n' +
    'Например: "50000-200000, 80-200, 10"\n' +
    'Или отправьте "-" чтобы пропустить:',
  profilesCreated: 'Профиль создан! ✓',
  profilesUpdated: 'Профиль обновлён! ✓',
  profilesEditWhat: 'Что изменить?',
  profilesEditName: 'Название',
  profilesEditKeywords: 'Ключевые слова',
  profilesEditFilters: 'Фильтры',
  profilesBack: '« Назад к профилям',

  // Favorites
  favoritesTitle: '⭐ Избранное:',
  favoritesEmpty: 'У вас нет сохранённых объявлений.',
  favoritesRemove: 'Удалить',
  favoritesRemoved: 'Удалено из избранного.',

  // Digest
  digestEmpty: 'Нет новых данных. Всё без изменений.',
  digestLoading: '🔄 Собираю дайджест...',

  buttonSearch: '🔍 Искать',
  buttonView: 'Открыть',
  buttonSave: '⭐ Сохранить',
  buttonPrev: '← Назад',
  buttonNext: 'Далее →',
  buttonBackToList: '← Назад к списку',

  // Digest buttons
  digestSummaryTitle: '🏠 <b>Дайджест</b>\n\n',
  digestNewButton(count: number, date: string): string {
    return `🆕 Новые (с ${date}) — ${count}`
  },
  digestPriceButton(count: number): string {
    return `📊 Цены (${count} изм.)`
  },
  digestNewTitle: '🆕 <b>Новые объявления:</b>\n\n',
  digestPriceTitle: '📊 <b>Изменения цен:</b>\n\n',

  resultHeader(start: number, end: number, total: number): string {
    return `Показано ${start}-${end} из ${total}`
  },

  resultCard(
    index: number,
    rooms: number | null,
    size: number | null,
    price: number | null,
    city: string | null,
    area: string | null,
    source: string,
    url: string
  ): string {
    const roomsStr = rooms ? `${rooms} комн., ` : ''
    const sizeStr = size ? `${size}м²` : ''
    const priceStr = price
      ? `€${price.toLocaleString('ru-RU')}`
      : 'Цена не указана'
    const location = [city, area].filter(Boolean).join(', ')

    return (
      `${index}. 🏠 ${roomsStr}${sizeStr} — ${priceStr}\n` +
      `📍 ${location || 'Н/Д'} | <a href="${url}">${source}</a>`
    )
  },

  detailCaption(
    title: string | null,
    rooms: number | null,
    size: number | null,
    price: number | null,
    city: string | null,
    area: string | null,
    plotSize: number | null,
    source: string,
    url: string
  ): string {
    const titleStr = title ?? 'Без названия'
    const roomsStr = rooms ? `${rooms} комн., ` : ''
    const sizeStr = size ? `${size}м²` : ''
    const priceStr = price
      ? `€${price.toLocaleString('ru-RU')}`
      : 'Цена не указана'
    const location = [city, area].filter(Boolean).join(', ')
    const plotStr = plotSize ? `\n📐 Участок: ${plotSize} ари` : ''

    return (
      `🏠 ${titleStr}, ${roomsStr}${sizeStr}\n` +
      `💰 ${priceStr}\n` +
      `📍 ${location || 'Н/Д'}${plotStr}\n` +
      `🔗 <a href="${url}">${source}</a>`
    )
  },
} as const
