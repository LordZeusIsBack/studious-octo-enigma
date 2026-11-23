import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalisePhone } from '../shared/validate.ts'

// Runs the real server as a child process against a throwaway database.
const port = 4100 + Math.floor(Math.random() * 800)
const base = `http://localhost:${port}`
const env = { ...process.env, PORT: String(port), DATABASE_PATH: join(mkdtempSync(join(tmpdir(), 'gamenight-')), 'test.db'), ADMIN_PASSWORD: 'secret', RESEND_API_KEY: '' }
let server: ChildProcess

async function start() {
  server = spawn(process.execPath, ['server/index.ts'], { env, stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('server did not start')
}
async function stop() {
  const exited = new Promise((r) => server.once('exit', r))
  server.kill()
  await exited
}

const guest = (over: Record<string, unknown> = {}) => ({
  table_id: 'main', seat_number: 1, full_name: 'Priya Sharma', room: '2007', phone: '9000000001', email: 'priya@example.com', experience: 'casual',
  ranking: ['uno', 'holdem', 'kittens'], ...over,
})
const book = (body: object) => fetch(`${base}/api/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const auth = { authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}` }

before(start)
after(stop)

test('phone numbers normalise to 10 digits', () => {
  assert.equal(normalisePhone('+91 98765-43210'), '9876543210')
  assert.equal(normalisePhone('098765 43210'), '9876543210')
  assert.equal(normalisePhone('919876543210'), '9876543210')
  assert.equal(normalisePhone('5876543210'), '') // Indian mobiles start 6-9
  assert.equal(normalisePhone('98765'), '')
})

let winnerPhone = ''
test('two people racing for one seat: exactly one wins, the other gets 409', async () => {
  const [a, b] = await Promise.all([book(guest()), book(guest({ full_name: 'Rahul Verma', phone: '9000000002', email: 'r@example.com' }))])
  assert.deepEqual([a.status, b.status].sort(), [201, 409])
  const loser = a.status === 409 ? a : b
  assert.equal((await loser.json()).error, 'seat_taken')
  winnerPhone = a.status === 201 ? '9000000001' : '9000000002'
})

test('the same phone cannot hold two seats, in any format', async () => {
  const res = await book(guest({ seat_number: 2, phone: `+91 ${winnerPhone.slice(0, 5)} ${winnerPhone.slice(5)}` }))
  assert.equal(res.status, 409)
  assert.ok((await res.json()).fields.phone)
})

test('server validates input and returns field errors', async () => {
  const res = await book(guest({ seat_number: 3, phone: '12345', email: 'nope', ranking: ['uno', 'uno', 'holdem'] }))
  assert.equal(res.status, 400)
  const { fields } = await res.json()
  assert.ok(fields.phone && fields.email && fields.ranking) // ranking must use each game once
  assert.equal((await book(guest({ seat_number: 99 }))).status, 400)
  assert.equal((await book(guest({ seat_number: 4, phone: '9000000009', company_url: 'spam' }))).status, 400) // honeypot
})

test('public seat list exposes first names only', async () => {
  const seats = await (await fetch(`${base}/api/seats`)).json()
  assert.equal(seats.length, 1)
  assert.deepEqual(Object.keys(seats[0]).sort(), ['first_name', 'seat_number', 'table_id'])
})

test('admin: password required, failed email recorded, cancel frees the seat', async () => {
  assert.equal((await fetch(`${base}/admin/api/bookings`)).status, 401)
  const { bookings } = await (await fetch(`${base}/admin/api/bookings`, { headers: auth })).json()
  assert.equal(bookings[0].email_status, 'failed')
  assert.match(bookings[0].email_error, /RESEND_API_KEY/)
  assert.equal(bookings[0].ranking, 'uno,holdem,kittens')

  const cancel = `${base}/admin/api/bookings/${bookings[0].id}/cancel`
  assert.equal((await fetch(cancel, { method: 'POST', headers: auth })).status, 403) // cross-site request blocked
  assert.equal((await fetch(cancel, { method: 'POST', headers: { ...auth, 'sec-fetch-site': 'same-origin' } })).status, 200)
  assert.deepEqual(await (await fetch(`${base}/api/seats`)).json(), [])
  assert.equal((await book(guest({ phone: bookings[0].phone }))).status, 201) // seat and phone are both free again

  const backup = await fetch(`${base}/admin/api/backup.db`, { headers: auth })
  assert.equal(Buffer.from(await backup.arrayBuffer()).subarray(0, 15).toString(), 'SQLite format 3')
})

test('bookings survive a server restart', async () => {
  await stop()
  await start()
  const seats = await (await fetch(`${base}/api/seats`)).json()
  assert.deepEqual(seats.map((s: { table_id: string; seat_number: number }) => `${s.table_id}:${s.seat_number}`), ['main:1'])
})
