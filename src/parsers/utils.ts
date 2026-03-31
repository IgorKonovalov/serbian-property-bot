/**
 * Convert a Serbian city/area name to a URL-friendly slug.
 * Handles Latin diacritics (č, ć, š, ž, đ) and general cleanup.
 */
export function cityToSlug(city: string): string {
  return city
    .toLowerCase()
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dj')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
