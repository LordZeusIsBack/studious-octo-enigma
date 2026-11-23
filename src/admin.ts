import './style.css'
import { gameName, games, tables, totalSeats } from '../shared/event.ts'
import { experiences, type BookingRow } from '../shared/validate.ts'

const rowsEl = document.querySelector('#rows')!
const statsEl = document.querySelector('#stats')!
const statusEl = document.querySelector('#status')!
const tableName = (id: string) => tables.find((t) => t.id === id)?.name ?? `${id} (removed)`
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Builds DOM with textContent only, so guest-typed text can never become HTML.
function h(tag: string, cls = '', ...children: (Node | string | null)[]) {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  el.append(...children.filter((c) => c !== null))
  return el
}

async function post(url: string) {
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) throw new Error(`Server replied ${res.status}`)
  return res.json()
}

function stat(label: string, value: string | number, bad = false) {
  return h('div', '', h('dt', '', label), h('dd', bad ? 'num bad' : 'num', String(value)))
}

function render(bookings: BookingRow[]) {
  const active = bookings.filter((b) => !b.cancelled_at)
  const failed = active.filter((b) => b.email_status === 'failed').length
  // Ranked vote: 1st choice scores games.length points, last choice scores 1.
  const points = new Map(games.map((g) => [g.id, 0]))
  for (const b of active) b.ranking.split(',').forEach((id, i) => points.has(id) && points.set(id, points.get(id)! + games.length - i))
  const top = Math.max(...points.values())
  statsEl.replaceChildren(
    stat('Booked', active.length),
    stat('Open', totalSeats - active.length),
    ...games.map((g) => stat(points.get(g.id) === top && top > 0 ? `${g.name} · leading` : g.name, `${points.get(g.id)} pts`)),
    stat('Emails failed', failed, failed > 0),
  )
  if (!bookings.length) return rowsEl.replaceChildren(h('tr', '', Object.assign(h('td', 'empty', 'No bookings yet.'), { colSpan: 9 })))

  rowsEl.replaceChildren(
    ...bookings.map((b) => {
      const resend = h('button', 'btn btn--ghost btn--sm', 'Resend') as HTMLButtonElement
      resend.addEventListener('click', async () => {
        resend.disabled = true
        try {
          const row: BookingRow = await post(`/admin/api/bookings/${b.id}/resend`)
          statusEl.textContent = row.email_status === 'sent' ? `Email for ${b.full_name} sent.` : `Still failing: ${row.email_error}`
        } catch (e) {
          statusEl.textContent = `Resend failed: ${(e as Error).message}`
        }
        load()
      })
      const cancel = h('button', 'btn btn--ghost btn--sm btn--danger', 'Cancel') as HTMLButtonElement
      cancel.addEventListener('click', async () => {
        if (!confirm(`Cancel ${b.full_name}'s booking for seat ${b.seat_number}? The seat becomes free again.`)) return
        try {
          await post(`/admin/api/bookings/${b.id}/cancel`)
          statusEl.textContent = `Cancelled. Seat ${b.seat_number} is open again.`
        } catch (e) {
          statusEl.textContent = `Cancel failed: ${(e as Error).message}`
        }
        load()
      })
      const email = b.cancelled_at
        ? h('span', 'chip chip--cancelled', 'Cancelled')
        : h('span', `chip chip--${b.email_status}`, b.email_status)
      const tr = h(
        'tr',
        b.cancelled_at ? 'cancelled' : '',
        h('td', 'who', h('strong', '', tableName(b.table_id)), h('span', 'muted num', `Seat ${b.seat_number}`)),
        h('td', 'who', h('strong', '', b.full_name), h('span', 'muted', `Room ${b.room}`)),
        h('td', '', h('a', '', `+91 ${b.phone}`), h('br'), h('span', 'muted', b.email)),
        h('td', 'vote', ...(b.ranking ? b.ranking.split(',').map((id, i) => h('span', '', `${i + 1}. ${gameName(id)}`)) : ['—'])),
        h('td', '', experiences[b.experience] ?? b.experience),
        h('td', '', b.bringing || '—', b.notes ? h('span', 'err muted', b.notes) : null),
        h('td', 'num muted', when(b.created_at)),
        h('td', '', email, b.email_error && !b.cancelled_at ? h('span', 'err', b.email_error) : null),
        h('td', 'actions', b.cancelled_at ? null : resend, b.cancelled_at ? null : cancel),
      )
      ;(tr.querySelector('a') as HTMLAnchorElement).href = `https://wa.me/91${b.phone}`
      return tr
    }),
  )
}

async function load() {
  try {
    const res = await fetch('/admin/api/bookings', { cache: 'no-store' })
    if (!res.ok) throw new Error(`Server replied ${res.status}`)
    render((await res.json()).bookings)
  } catch (e) {
    statusEl.textContent = `Could not load bookings. ${(e as Error).message}`
  }
}
load()
