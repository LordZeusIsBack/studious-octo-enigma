import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Booking, BookingRow } from '../shared/validate.ts'

const path = process.env.DATABASE_PATH || './data/gamenight.db'
mkdirSync(dirname(path), { recursive: true })
const db = new Database(path)
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')

// Append only, never edit a shipped entry. PRAGMA user_version counts how many have run.
const migrations = [
  `CREATE TABLE bookings (
     id INTEGER PRIMARY KEY,
     table_id TEXT NOT NULL,
     seat_number INTEGER NOT NULL,
     full_name TEXT NOT NULL,
     first_name TEXT NOT NULL,
     room TEXT NOT NULL,
     phone TEXT NOT NULL,
     email TEXT NOT NULL,
     experience TEXT NOT NULL,
     bringing TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
     cancelled_at TEXT,
     email_status TEXT NOT NULL DEFAULT 'pending',
     email_error TEXT
   );
   -- Partial indexes: a cancelled booking frees both the seat and the phone number.
   CREATE UNIQUE INDEX one_booking_per_seat ON bookings (table_id, seat_number) WHERE cancelled_at IS NULL;
   CREATE UNIQUE INDEX one_seat_per_phone ON bookings (phone) WHERE cancelled_at IS NULL;`,
  `ALTER TABLE bookings ADD COLUMN ranking TEXT NOT NULL DEFAULT ''`,
]
const applied = db.pragma('user_version', { simple: true }) as number
for (let i = applied; i < migrations.length; i++) {
  db.transaction(() => {
    db.exec(migrations[i])
    db.pragma(`user_version = ${i + 1}`)
  })()
}

const q = {
  insert: db.prepare(`INSERT INTO bookings (table_id, seat_number, full_name, first_name, room, phone, email, experience, ranking, bringing, notes)
    VALUES (@table_id, @seat_number, @full_name, @first_name, @room, @phone, @email, @experience, @ranking, @bringing, @notes) RETURNING *`),
  seats: db.prepare('SELECT table_id, seat_number, first_name FROM bookings WHERE cancelled_at IS NULL'),
  all: db.prepare('SELECT * FROM bookings ORDER BY cancelled_at IS NOT NULL, created_at DESC'),
  get: db.prepare('SELECT * FROM bookings WHERE id = ?'),
  cancel: db.prepare(`UPDATE bookings SET cancelled_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ? AND cancelled_at IS NULL`),
  email: db.prepare('UPDATE bookings SET email_status = ?, email_error = ? WHERE id = ?'),
  ping: db.prepare('SELECT 1'),
}

// A single INSERT is atomic in SQLite; the unique indexes are what make double booking impossible.
export function insertBooking(b: Booking): BookingRow | 'seat_taken' | 'phone_taken' {
  try {
    return q.insert.get(b) as BookingRow
  } catch (e) {
    if ((e as { code?: string }).code !== 'SQLITE_CONSTRAINT_UNIQUE') throw e
    return (e as Error).message.includes('phone') ? 'phone_taken' : 'seat_taken'
  }
}

export const seats = () => q.seats.all() as Pick<BookingRow, 'table_id' | 'seat_number' | 'first_name'>[]
export const allBookings = () => q.all.all() as BookingRow[]
export const getBooking = (id: number) => q.get.get(id) as BookingRow | undefined
export const cancelBooking = (id: number) => q.cancel.run(id).changes > 0
export const setEmailStatus = (id: number, status: BookingRow['email_status'], error: string | null) => q.email.run(status, error, id)
export const ping = () => q.ping.get()
export const snapshot = () => new Uint8Array(db.serialize()) // consistent copy of the whole database, WAL included
export const close = () => db.close()
