export type Category = 'Cerita' | 'Jurnal' | 'Renungan'

export type Entry = {
  id: string
  title: string
  body: string
  author: string
  category: Category
  createdAt: number
  link?: string
}

export const CATEGORIES: Category[] = ['Cerita', 'Jurnal', 'Renungan']

export function isEntry(value: unknown): value is Entry {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.body === 'string' &&
    typeof item.author === 'string' &&
    typeof item.createdAt === 'number' &&
    CATEGORIES.includes(item.category as Category)
  )
}
