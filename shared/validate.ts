import { games, tables } from './event.ts'

export const experiences = { never: 'Never played', casual: 'Casual', confident: 'Confident' } as const
export type Experience = keyof typeof experiences

export type Booking = {
  table_id: string
  seat_number: number
  full_name: string
  first_name: string
  room: string
  phone: string
  email: string
  experience: Experience
  ranking: string // game ids, favourite first, comma-separated
  bringing: string
  notes: string
}

export type BookingRow = Booking & {
  id: number
  created_at: string
  cancelled_at: string | null
  email_status: 'pending' | 'sent' | 'failed'
  email_error: string | null
}

export type Errors = Partial<Record<keyof Booking, string>>

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// Accepts "98765 43210", "+91 98765-43210", "098765..." and returns the bare 10 digits, or ''.
export function normalisePhone(v: unknown): string {
  const digits = str(v).replace(/[\s()-]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(digits) ? digits : ''
}

// Used by the browser (inline errors) and the server (the real check).
export function validateBooking(raw: Record<string, unknown>): { booking?: Booking; errors: Errors } {
  const errors: Errors = {}
  const table = tables.find((t) => t.id === raw.table_id)
  const seat = Number(raw.seat_number)
  if (!table) errors.table_id = 'That table does not exist.'
  else if (!Number.isInteger(seat) || seat < 1 || seat > table.seats) errors.seat_number = 'That seat does not exist.'

  const full_name = str(raw.full_name).replace(/\s+/g, ' ')
  if (full_name.length < 2) errors.full_name = 'We need a name for the place card.'
  else if (full_name.length > 60) errors.full_name = 'Keep it under 60 characters.'

  const room = str(raw.room)
  if (!room) errors.room = 'Which room are you in?'
  else if (!/^[A-Za-z0-9 /-]{1,12}$/.test(room)) errors.room = 'Just the room number, like 2007 or B-12.'

  const phone = normalisePhone(raw.phone)
  if (!str(raw.phone)) errors.phone = 'We need a number to reach you on.'
  else if (!phone) errors.phone = 'Use a 10-digit Indian mobile number.'

  const email = str(raw.email).toLowerCase()
  if (!email) errors.email = 'We need an email for the booking.'
  else if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'That email does not look right.'

  const experience = str(raw.experience) as Experience
  if (!(experience in experiences)) errors.experience = 'Pick one, honesty helps the table.'

  // The full list of game ids in preference order, each exactly once.
  const r = raw.ranking
  const rankingOk = Array.isArray(r) && r.length === games.length && games.every((g) => r.includes(g.id))
  if (!rankingOk) errors.ranking = `Give each game a number from 1 to ${games.length}.`

  const bringing = str(raw.bringing)
  if (bringing.length > 200) errors.bringing = 'Keep it under 200 characters.'
  const notes = str(raw.notes)
  if (notes.length > 500) errors.notes = 'Keep it under 500 characters.'

  if (Object.keys(errors).length) return { errors }
  const first_name = full_name.split(' ')[0]
  return { booking: { table_id: table!.id, seat_number: seat, full_name, first_name, room, phone, email, experience, ranking: (r as string[]).join(','), bringing, notes }, errors }
}
