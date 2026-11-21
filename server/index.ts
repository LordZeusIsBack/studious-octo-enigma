import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { secureHeaders } from 'hono/secure-headers'
import { readFileSync } from 'node:fs'
import { event, gameName, tables } from '../shared/event.ts'
import { experiences, validateBooking, type BookingRow } from '../shared/validate.ts'
import * as db from './db.ts'
import { sendBookingEmail } from './email.ts'

const app = new Hono()
app.use(secureHeaders())
app.use(compress())

app.get('/health', (c) => {
  db.ping()
  return c.json({ ok: true })
})

// Public: first names only. Phone, email and room never leave the server on public routes.
app.get('/api/seats', (c) => {
  c.header('Cache-Control', 'no-store')
  return c.json(db.seats())
})

// shortcut: in-memory, per IP, single instance only. A whole PG may share one Wi-Fi IP, hence the generous limit.
const hits = new Map<string, number[]>()
function rateLimited(ip: string) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000)
  hits.set(ip, recent)
  if (recent.length >= 20) return true
  recent.push(now)
  return false
}

async function deliver(row: BookingRow) {
  try {
    await sendBookingEmail(row)
    db.setEmailStatus(row.id, 'sent', null)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`Email for booking #${row.id} failed: ${message}`)
    db.setEmailStatus(row.id, 'failed', message)
  }
}

app.post('/api/bookings', bodyLimit({ maxSize: 10_000 }), async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'direct'
  if (rateLimited(ip)) return c.json({ error: 'rate_limited', message: 'Too many tries from here. Give it ten minutes.' }, 429)
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json({ error: 'bad_request', message: 'That request did not make sense.' }, 400)
  if (body.company_url) return c.json({ error: 'bad_request', message: 'Could not submit. Refresh the page and try again.' }, 400) // honeypot

  const { booking, errors } = validateBooking(body)
  if (!booking) return c.json({ error: 'invalid', fields: errors }, 400)
  const row = db.insertBooking(booking)
  if (row === 'seat_taken') return c.json({ error: 'seat_taken', message: 'Someone just took that seat.' }, 409)
  if (row === 'phone_taken')
    return c.json({ error: 'phone_taken', fields: { phone: `This number already has a seat. Message ${event.host} to switch.` } }, 409)

  console.log(`Booking #${row.id}: ${row.table_id} seat ${row.seat_number}`)
  void deliver(row) // not awaited: the booking is already saved, and the row records whether the email went out
  return c.json({ id: row.id, table_id: row.table_id, seat_number: row.seat_number, first_name: row.first_name }, 201)
})

const icsText = (s: string) => s.replace(/([,;\\])/g, '\\$1')
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, '')
app.get('/api/calendar.ics', (c) => {
  const table = tables.find((t) => t.id === c.req.query('table'))
  const seat = Number(c.req.query('seat'))
  const where = table && Number.isInteger(seat) && seat >= 1 && seat <= table.seats ? ` · ${table.name}, seat ${seat}` : ''
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//game-night//EN', 'BEGIN:VEVENT',
    `UID:game-night-${icsDate(event.start)}@pg`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${icsText(event.name + where)}`,
    `LOCATION:${icsText(event.venue)}`,
    `DESCRIPTION:${icsText(`Doors at ${event.timeLabel}. Questions: ${event.host}, ${event.hostEmail}`)}`,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
  return c.body(ics, 200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="game-night.ics"' })
})

// Admin: browser login prompt, username "admin", password from ADMIN_PASSWORD.
const password = process.env.ADMIN_PASSWORD
const adminAuth = password
  ? basicAuth({ username: 'admin', password, realm: 'Game night admin' })
  : basicAuth({ verifyUser: () => false, realm: 'Set ADMIN_PASSWORD first' })
app.use('/admin', adminAuth)
app.use('/admin/*', adminAuth)
// Browsers resend Basic credentials on cross-site requests, so admin writes must come from our own page.
app.use('/admin/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.header('sec-fetch-site') !== 'same-origin') return c.json({ error: 'forbidden' }, 403)
  await next()
})

app.get('/admin/api/bookings', (c) => c.json({ bookings: db.allBookings(), tables }))

app.post('/admin/api/bookings/:id/cancel', (c) => {
  const ok = db.cancelBooking(Number(c.req.param('id')))
  return ok ? c.json({ ok }) : c.json({ error: 'not_found' }, 404)
})

app.post('/admin/api/bookings/:id/resend', async (c) => {
  const row = db.getBooking(Number(c.req.param('id')))
  if (!row) return c.json({ error: 'not_found' }, 404)
  await deliver(row)
  return c.json(db.getBooking(row.id))
})

// Leading =, +, - or @ makes Excel run the cell as a formula; prefix with ' to neutralise it.
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`
app.get('/admin/api/bookings.csv', (c) => {
  const cols = ['id', 'created_at', 'table', 'seat_number', 'full_name', 'room', 'phone', 'email', 'experience', 'ranking', 'bringing', 'notes', 'email_status', 'email_error', 'cancelled_at'] as const
  const lines = db.allBookings().map((b) =>
    cols.map((k) => csvCell(k === 'table' ? (tables.find((t) => t.id === b.table_id)?.name ?? b.table_id) : k === 'experience' ? experiences[b.experience] : k === 'ranking' ? b.ranking.split(',').map(gameName).join(' > ') : b[k])).join(','),
  )
  return c.body([cols.join(','), ...lines].join('\r\n'), 200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="game-night-bookings.csv"',
  })
})

app.get('/admin/api/backup.db', (c) =>
  c.body(db.snapshot(), 200, {
    'Content-Type': 'application/vnd.sqlite3',
    'Content-Disposition': `attachment; filename="gamenight-${new Date().toISOString().slice(0, 10)}.db"`,
  }),
)

// The home page gets absolute Open Graph URLs, which WhatsApp needs for the link preview.
app.get('/', (c) => {
  const indexHtml = readFileSync('./dist/index.html', 'utf8')
  const host = /^[a-z0-9.:-]+$/i.test(c.req.header('host') ?? '') ? c.req.header('host') : 'localhost'
  const proto = c.req.header('x-forwarded-proto') === 'https' ? 'https' : 'http'
  return c.html(indexHtml.replaceAll('__ORIGIN__', `${proto}://${host}`))
})
// Vite puts a content hash in every /assets filename, so they can be cached forever.
app.use('/assets/*', async (c, next) => {
  await next()
  if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable')
})
app.use('/*', serveStatic({ root: './dist' }))

const port = Number(process.env.PORT) || 3000
const server = serve({ fetch: app.fetch, port }, (info) => console.log(`Game night on http://localhost:${info.port}`))
// Node as PID 1 in Docker ignores SIGTERM unless handled; close cleanly so Railway redeploys fast.
const stop = () => server.close(() => (db.close(), process.exit(0)))
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
