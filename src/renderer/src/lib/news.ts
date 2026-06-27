export interface NewsItem {
  id: string
  title: string
  date: string   // ISO 8601 date string, e.g. "2026-06-27"
  body: string
  tag?: 'update' | 'announcement' | 'hotfix'
}

const NEWS: NewsItem[] = [
  {
    id: '0.1.2',
    title: 'Ender Client 0.1.2 Released',
    date: '2026-06-27',
    body: 'Improved API key handling, added relay URL settings, and updated user-agent headers across the board.',
    tag: 'update',
  },
]

export default NEWS
