import { escapeHtml } from '../utils'

export const messages = {
  welcome:
    '🏠 <b>Property Bot</b>\n\n' +
    'Я помогу найти недвижимость в Сербии.\n\n' +
    '🔍 /search — Поиск недвижимости\n' +
    '📋 /profiles — Профили поиска\n' +
    '⭐ /favorites — Избранное\n' +
    '📊 /digest — Изменения цен и новые объявления\n' +
    '⚙️ /settings — Настройки',

  searchSelectProfiles: 'Выберите профили поиска (нажмите для переключения):',
  searchEnterArea: 'Введите район/город (например "Novi Sad", "Beograd"):',
  searchNoProfiles: 'У вас нет профилей поиска. Создайте через /profiles.',
  searchSelectAtLeast: 'Выберите хотя бы один профиль!',
  searchSessionExpired: 'Сессия истекла. Используйте /search заново.',
  searchSearching: '🔍 Ищу...',
  searchNoResults: 'Ничего не найдено. Попробуйте другие профили или район.',
  searchFailed: 'Ошибка поиска. Попробуйте позже.',
  searchSaved: '⭐ Сохранено в избранное!',
  searchAlreadySaved: 'Уже в избранном',
  searchListingNotFound: 'Объявление не найдено в базе.',

  // Profiles
  profilesList: '📋 Ваши профили поиска:',
  profilesEmpty:
    'У вас нет профилей поиска. Нажмите кнопку ниже, чтобы добавить.',
  profilesAdd: '➕ Добавить профиль',
  profilesRun: '▶️ Запустить',
  profilesEdit: '✏️ Изменить',
  profilesDelete: '🗑 Удалить',
  profilesDeleted: 'Профиль удалён.',
  profilesNotFound: 'Профиль не найден.',
  profilesEnterName: 'Введите название профиля:',
  profilesEnterKeywords(defaultName: string): string {
    return (
      'Введите ключевые слова для поиска (на сербском).\n' +
      `Или отправьте "-" чтобы использовать название: "${escapeHtml(defaultName)}"`
    )
  },
  profilesEnterFilters:
    'Введите фильтры (необязательно, формат: цена_от-цена_до, м²_от-м²_до, плац_от).\n' +
    'Например: "50000-200000, 80-200, 10"\n' +
    'Или отправьте "-" чтобы пропустить:',
  profilesCreated: 'Профиль создан! ✓',
  profilesUpdated: 'Профиль обновлён! ✓',
  profilesEditWhat: 'Что изменить?',
  profilesEditName: '✏️ Название',
  profilesEditKeywords: '✏️ Ключевые слова',
  profilesEditFilters: '✏️ Фильтры',
  profilesBack: '« К профилям',
  profilesCancel: '✕ Отмена',
  profilesCancelled: 'Отменено.',
  profilesConfirmDelete(name: string): string {
    return `Удалить профиль «${escapeHtml(name)}»?`
  },
  profilesConfirmDeleteYes: '🗑 Да, удалить',

  // Favorites
  favoritesTitle: '⭐ Избранное:',
  favoritesEmpty: 'У вас нет сохранённых объявлений.',
  favoritesRemove: '🗑 Удалить',
  favoritesRemoved: 'Удалено из избранного.',
  favoritesClearAll: '🗑 Очистить всё',
  favoritesClearConfirm(count: number): string {
    return `Удалить все ${count} избранных?`
  },
  favoritesClearConfirmYes: '🗑 Да, удалить все',
  favoritesCleared: 'Избранное очищено.',

  // Digest
  digestEmpty: 'Нет новых данных. Всё без изменений.',
  digestLoading: '🔄 Собираю дайджест...',
  digestFailed: 'Ошибка при сборке дайджеста. Попробуйте позже.',

  // Buttons
  buttonSearch: '🔍 Искать',
  buttonView: '🔗 Открыть',
  buttonSave: '⭐ Сохранить',
  buttonSaved: '✅ Сохранено',
  buttonPrev: '◀ Назад',
  buttonNext: 'Далее ▶',
  buttonBackToList: '« К списку',
  buttonCancel: '✕ Отмена',

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

  // Help
  helpButton: '❓ Помощь',
  helpBack: '« К помощи',
  helpIntro: '❓ <b>Помощь</b>\n\n' + 'Выберите тему, чтобы узнать подробнее:',
  helpSearch:
    '🔍 <b>Поиск недвижимости</b>\n\n' +
    '1. Откройте /search\n' +
    '2. Выберите один или несколько профилей поиска (✅/◻️)\n' +
    '3. Нажмите «Искать»\n' +
    '4. Введите район или город (на сербском, например "Novi Sad")\n' +
    '5. Просматривайте результаты, листайте страницы\n' +
    '6. Нажмите «Сохранить» чтобы добавить в избранное',
  helpProfiles:
    '📋 <b>Профили поиска</b>\n\n' +
    '1. Откройте /profiles\n' +
    '2. Нажмите на профиль чтобы просмотреть детали\n' +
    '3. Используйте «Изменить» или «Удалить»\n' +
    '4. Нажмите «Добавить профиль» для создания нового\n' +
    '5. Введите название, ключевые слова (на сербском) и фильтры\n' +
    '6. Профили используются в поиске и ежедневном дайджесте',
  helpFavorites:
    '⭐ <b>Избранное</b>\n\n' +
    '1. Сохраняйте объявления кнопкой «Сохранить» в результатах поиска\n' +
    '2. Откройте /favorites чтобы просмотреть сохранённые\n' +
    '3. Нажмите «Открыть» для перехода на сайт\n' +
    '4. Нажмите «Удалить» чтобы убрать из избранного\n' +
    '5. Бот отслеживает изменения цен на сохранённые объявления',
  helpDigest:
    '📊 <b>Дайджест</b>\n\n' +
    '1. Каждое утро в 08:00 бот проверяет все сайты\n' +
    '2. Если цены на избранные объявления изменились — вы получите уведомление\n' +
    '3. Новые объявления по вашим профилям тоже попадают в дайджест\n' +
    '4. Откройте /digest чтобы получить дайджест прямо сейчас\n' +
    '5. Если изменений нет — бот не беспокоит',

  // Navigation
  buttonMainMenu: '🏠 Меню',
  buttonNewSearch: '🔍 Новый поиск',
  buttonCreateProfile: '📋 Создать профиль',
  buttonRetry: '🔄 Повторить',
  buttonBackToDigest: '« К дайджесту',

  // Settings
  settingsTitle: '⚙️ <b>Настройки</b>',
  settingsSources: '🌐 Источники поиска',
  settingsSourcesTitle:
    '🌐 <b>Источники поиска</b>\n\nВключите или отключите сайты для поиска:',
  settingsBackToMenu: '« Назад к настройкам',
  settingsSiteEnabled: 'Включено',
  settingsSiteDisabled: 'Отключено',

  resultHeader(start: number, end: number, total: number): string {
    return `Показано ${start}-${end} из ${total}`
  },

  resultCard(
    index: number,
    title: string | null,
    rooms: number | null,
    size: number | null,
    plotSize: number | null,
    price: number | null,
    city: string | null,
    area: string | null,
    source: string,
    url: string
  ): string {
    const titleStr = title ? escapeHtml(title) : ''
    const roomsStr = rooms ? `${rooms} комн.` : ''
    const sizeStr = size ? `${size}м²` : ''
    const specs = [roomsStr, sizeStr].filter(Boolean).join(', ')
    const plotStr = plotSize ? ` | 📐 ${plotSize} ар` : ''
    const priceStr = price
      ? `€${price.toLocaleString('ru-RU')}`
      : 'Цена не указана'
    const location = [city, area].filter(Boolean).join(', ')

    return (
      `${index}. 🏠 <b>${priceStr}</b>${specs ? ` — ${specs}` : ''}${plotStr}\n` +
      (titleStr ? `${titleStr}\n` : '') +
      `📍 ${escapeHtml(location || 'Н/Д')} | <a href="${url}">${escapeHtml(source)}</a>`
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
    const titleStr = escapeHtml(title ?? 'Без названия')
    const roomsStr = rooms ? `${rooms} комн., ` : ''
    const sizeStr = size ? `${size}м²` : ''
    const priceStr = price
      ? `€${price.toLocaleString('ru-RU')}`
      : 'Цена не указана'
    const location = escapeHtml(
      [city, area].filter(Boolean).join(', ') || 'Н/Д'
    )
    const plotStr = plotSize ? `\n📐 Участок: ${plotSize} ари` : ''

    return (
      `🏠 ${titleStr}, ${roomsStr}${sizeStr}\n` +
      `💰 ${priceStr}\n` +
      `📍 ${location}${plotStr}\n` +
      `🔗 <a href="${url}">${escapeHtml(source)}</a>`
    )
  },

  formatProfile(p: {
    name: string
    keywords: string
    min_price: number | null
    max_price: number | null
    min_size: number | null
    max_size: number | null
    min_plot_size: number | null
  }): string {
    const filters: string[] = []
    if (p.min_price || p.max_price) {
      filters.push(`€${p.min_price ?? '...'}-${p.max_price ?? '...'}`)
    }
    if (p.min_size || p.max_size) {
      filters.push(`${p.min_size ?? '...'}−${p.max_size ?? '...'}м²`)
    }
    if (p.min_plot_size) {
      filters.push(`от ${p.min_plot_size} ар`)
    }
    const filtersStr =
      filters.length > 0 ? `\nФильтры: ${filters.join(', ')}` : ''
    return `📌 <b>${escapeHtml(p.name)}</b>\nКлючевые слова: ${escapeHtml(p.keywords)}${filtersStr}`
  },
} as const
