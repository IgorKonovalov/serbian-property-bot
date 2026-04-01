/**
 * Shared parsing helpers for extracting price, size, rooms, and plot size
 * from HTML text across all property site parsers.
 */

/**
 * Parse a price string, removing thousands separators and non-digit chars.
 * Handles formats like "449.000", "295.000 €", "21 000", etc.
 */
export function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[^\d]/g, '')
  const num = parseInt(cleaned, 10)
  return isNaN(num) || num === 0 ? null : num
}

/**
 * Parse a size string, extracting the number before m²/m2.
 * Handles formats like "80 m²", "131m2", "95.5 m²".
 */
export function parseSize(text: string | undefined): number | null {
  if (!text) return null
  const match = text.match(/([\d,.]+)\s*m[²2]/i)
  if (!match) return null
  const num = parseFloat(match[1].replace(',', '.'))
  return isNaN(num) ? null : Math.round(num)
}

/**
 * Parse a rooms count from text.
 * Handles formats like "3.0 Broj soba", "4.0 četvorosobna", "Broj soba: 2.5".
 */
export function parseRooms(text: string | undefined): number | null {
  if (!text) return null
  // Try "N Broj soba" pattern (halooglasi)
  const match1 = text.match(/([\d.]+)\s*Broj soba/i)
  if (match1) {
    const num = parseFloat(match1[1])
    return isNaN(num) ? null : num
  }
  // Try "Broj soba: N" pattern (oglasi)
  const match2 = text.match(/Broj soba[:\s]*([\d.,]+)/i)
  if (match2) {
    const num = parseFloat(match2[1].replace(',', '.'))
    return isNaN(num) ? null : num
  }
  // Try "N sobna" pattern (kupujemprodajem)
  const match3 = text.match(/([\d.]+)\+?\s*(?:[a-z\u010d\u0107\u0161\u017e\u0111]*sobna)/i)
  if (match3) {
    const num = parseFloat(match3[1])
    return isNaN(num) ? null : num
  }
  return null
}

/**
 * Parse a plot size in m² and convert to ares (÷ 100).
 * Handles format like "Površina zemljišta: 500 m2".
 */
export function parsePlotSize(text: string | undefined): number | null {
  if (!text) return null
  const match = text.match(/(\d+)\s*m[²2]/i)
  if (!match) return null
  const sqMeters = parseInt(match[1], 10)
  return isNaN(sqMeters) ? null : Math.round(sqMeters / 100)
}
