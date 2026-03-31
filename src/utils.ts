export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function escapeUrl(url: string): string {
  return url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
