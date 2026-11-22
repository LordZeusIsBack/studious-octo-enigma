import './style.css'
import { event, gameName, games, tables, totalSeats, type GameTable } from '../shared/event.ts'
import { validateBooking, type Errors } from '../shared/validate.ts'
import { ring, table as shape } from './art.ts'

type Seat = { table_id: string; seat_number: number; first_name: string }
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
const key = (tableId: string, n: number) => `${tableId}:${n}`

// ---------- Tables ----------
const seatEls = new Map<string, HTMLButtonElement>()

function renderTable(t: GameTable) {
  const el = document.createElement('article')
  el.className = 'table'
  el.dataset.theme = 'house'
  el.setAttribute('aria-labelledby', `t-${t.id}`)
  el.innerHTML = `
    <div class="table-info">
      <p class="label table-num">${t.seats} chairs</p>
      <h3 id="t-${t.id}">${t.name}</h3>
      <p class="blurb">${t.blurb}</p>
      <dl class="meta"><dt>Game</dt><dd>Decided by your votes</dd><dt>Doors</dt><dd class="num">${event.timeLabel}</dd><dt>Chairs</dt><dd class="num">${t.seats}</dd></dl>
      <div class="availability">
        <p class="count num" aria-live="polite"><span class="skeleton">Checking chairs</span></p>
        <div class="bar" style="--n:${t.seats}">${'<i></i>'.repeat(t.seats)}</div>
        <p class="roster"></p>
      </div>
    </div>
    <div class="map" style="aspect-ratio:${shape.w}/${shape.h}">${shape.svg}</div>`
  const map = $('.map', el)
  ring(t.seats, shape.rx, shape.ry).forEach((p, i) => {
    const n = i + 1
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'seat'
    b.dataset.state = 'loading'
    b.dataset.x = p.x < -shape.w * 0.22 ? 'l' : p.x > shape.w * 0.22 ? 'r' : 'c'
    b.style.left = `${((shape.w / 2 + p.x) / shape.w) * 100}%`
    b.style.top = `${((shape.h / 2 + p.y) / shape.h) * 100}%`
    b.style.setProperty('--rot', `${p.deg}deg`)
    b.setAttribute('aria-label', `${t.name}, seat ${n}, loading`)
    b.setAttribute('aria-disabled', 'true')
    b.innerHTML = `<svg class="chair" viewBox="0 0 40 40" aria-hidden="true"><path class="back" d="M9.5 9 Q20 3 30.5 9"/><rect class="cushion" x="9" y="12" width="22" height="20" rx="6"/></svg><span class="seat-num num" aria-hidden="true">${n}</span><span class="avatar" aria-hidden="true"></span>`
    b.addEventListener('click', () => b.dataset.state === 'open' && openSheet(t, n))
    seatEls.set(key(t.id, n), b)
    map.append(b)
  })
  return el
}

const list = $('#table-list')
tables.forEach((t) => list.append(renderTable(t)))

// The games on the ballot: a card each on the page, and a 1/2/3 row each in the booking form.
$('#game-list').innerHTML = games
  .map((g) => `<article class="game" data-theme="${g.id}"><h3>${g.name}</h3><p>${g.blurb}</p><dl class="meta"><dt>Rounds</dt><dd>${g.duration}</dd><dt>Skill</dt><dd>${g.skill}</dd></dl></article>`)
  .join('')
$('#rank-rows').innerHTML = games
  .map((g) => `<div class="rank-row" data-theme="${g.id}" role="radiogroup" aria-label="${g.name}"><span class="rank-name">${g.name}</span><span class="rank-opts">${games
    .map((_, i) => `<label><input type="radio" name="rank_${g.id}" value="${i + 1}" aria-label="${g.name}: choice ${i + 1}" /><span aria-hidden="true">${i + 1}</span></label>`)
    .join('')}</span></div>`)
  .join('')

let taken = new Map<string, string>()

function apply(seats: Seat[]) {
  taken = new Map(seats.map((s) => [key(s.table_id, s.seat_number), s.first_name]))
  let left = 0
  for (const t of tables) {
    const article = $(`[aria-labelledby="t-${t.id}"]`)
    const names: string[] = []
    for (let n = 1; n <= t.seats; n++) {
      const b = seatEls.get(key(t.id, n))!
      const name = taken.get(key(t.id, n))
      if (name) names.push(name)
      const state = name ? 'taken' : 'open'
      if (b.dataset.state === state && (b.dataset.name ?? '') === (name ?? '')) continue
      b.dataset.state = state
      b.dataset.name = name ?? ''
      b.tabIndex = name ? -1 : 0 // taken seats still show their tooltip on tap, but Tab skips them
      b.toggleAttribute('aria-disabled', !!name)
      b.setAttribute('aria-label', name ? `${t.name}, seat ${n}, taken by ${name}` : `${t.name}, seat ${n}, available`)
      b.dataset.tip = name ? `Taken by ${name}` : `Seat ${n} · Available`
      $('.avatar', b).textContent = name ? name[0].toUpperCase() : ''
    }
    const free = t.seats - names.length
    left += free
    article.classList.toggle('is-full', free === 0)
    $('.count', article).textContent = free === 0 ? 'Full. Every chair is spoken for.' : `${free} of ${t.seats} seats left`
    article.querySelectorAll('.bar i').forEach((i, idx) => i.classList.toggle('on', idx < names.length))
    $('.roster', article).textContent = names.length ? `At the table: ${names.join(', ')}` : 'No one yet. First chair, best chair.'
  }
  $('#seats-left').textContent = left === 0 ? 'Every chair is taken' : `${left} of ${totalSeats} chairs left`

  // Someone else took the seat this person has open in the sheet.
  if (current && sheet.open && view === 'form' && taken.has(key(current.t.id, current.n))) showTaken(taken.get(key(current.t.id, current.n)))
}

// ---------- Polling ----------
const status = $('#status')
let inFlight = false
let loaded = false
async function refresh() {
  if (inFlight) return
  inFlight = true
  try {
    const res = await fetch('/api/seats', { cache: 'no-store' })
    if (!res.ok) throw new Error(String(res.status))
    apply(await res.json())
    loaded = true
    status.textContent = ''
  } catch {
    status.textContent = loaded
      ? 'Lost the connection to the room. Showing the last known seats and retrying.'
      : 'Cannot reach the room right now. Retrying every few seconds.'
  } finally {
    inFlight = false
  }
}

let timer: ReturnType<typeof setInterval> | undefined
function startPolling() {
  clearInterval(timer)
  timer = setInterval(refresh, 5000)
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearInterval(timer)
  else {
    refresh()
    startPolling()
  }
})
refresh()
startPolling()

// ---------- Booking sheet ----------
const sheet = $<HTMLDialogElement>('#sheet')
const form = $<HTMLFormElement>('#book')
const submit = $<HTMLButtonElement>('#submit')
const formMessage = $('#form-message')
const fields = ['full_name', 'room', 'phone', 'email', 'ranking', 'experience', 'bringing', 'notes'] as const
let current: { t: GameTable; n: number } | null = null
let view: 'form' | 'taken' | 'done' = 'form'
const touched = new Set<string>()

function show(v: typeof view) {
  view = v
  sheet.querySelectorAll<HTMLElement>('.view').forEach((el) => (el.hidden = el.dataset.view !== v))
}

function openSheet(t: GameTable, n: number) {
  current = { t, n }
  sheet.dataset.theme = 'house'
  $('#sheet-table').textContent = t.name
  $('#sheet-title').textContent = `Seat ${n}`
  submit.textContent = `Take seat ${n}`
  formMessage.textContent = ''
  show('form')
  sheet.showModal()
  refresh() // re-check right away: the seat may have gone since the last poll
}

function showTaken(name?: string) {
  if (!current) return
  $('#taken-text').textContent = `${name ? `${name} just took` : 'Someone just took'} seat ${current.n}. Your details are saved here, so pick another chair and you're done in a tap.`
  show('taken')
}

// Game ids ordered by the rank each one was given; a gap means the person has not ranked everything yet.
function ranking() {
  const order: string[] = []
  for (const g of games) {
    const rank = Number((form.elements.namedItem(`rank_${g.id}`) as RadioNodeList).value)
    if (rank) order[rank - 1] = g.id
  }
  return order
}

function payload() {
  return { ...Object.fromEntries(new FormData(form)), ranking: ranking(), table_id: current!.t.id, seat_number: current!.n }
}

// Giving a game a rank another game already holds swaps the two, so the ranking is always a clean 1, 2, 3.
let lastRanks = new Map<string, string>()
form.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement
  if (!input.name.startsWith('rank_')) return
  const previous = lastRanks.get(input.name)
  form.querySelectorAll<HTMLInputElement>(`[name^="rank_"][value="${input.value}"]:checked`).forEach((other) => {
    if (other === input) return
    other.checked = false
    if (previous) form.querySelector<HTMLInputElement>(`[name="${other.name}"][value="${previous}"]`)!.checked = true
  })
  lastRanks = new Map(games.map((g) => [`rank_${g.id}`, (form.elements.namedItem(`rank_${g.id}`) as RadioNodeList).value]))
  if (touched.has('ranking')) showErrors(validateBooking(payload()).errors, false)
})

function showErrors(errors: Errors, all: boolean) {
  for (const f of fields) {
    const msg = all || touched.has(f) ? (errors[f] ?? '') : ''
    $(`#e-${f}`).textContent = msg
    form.querySelectorAll(`[name="${f}"], [data-field="${f}"]`).forEach((input) => input.toggleAttribute('aria-invalid', !!msg))
  }
}

form.addEventListener('focusout', (e) => {
  const name = (e.target as HTMLInputElement).name
  if (!name || name === 'experience' || name.startsWith('rank_')) return
  if ((e.target as HTMLInputElement).value) touched.add(name)
  showErrors(validateBooking(payload()).errors, false)
})
form.addEventListener('input', (e) => {
  const name = (e.target as HTMLInputElement).name
  if (name === 'experience') touched.add(name)
  if (touched.has(name)) showErrors(validateBooking(payload()).errors, false)
})

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (!current || submit.disabled) return
  formMessage.textContent = ''
  const body = payload()
  const { errors } = validateBooking(body)
  fields.forEach((f) => touched.add(f))
  showErrors(errors, true)
  const firstBad = fields.find((f) => errors[f])
  if (firstBad) return form.querySelector<HTMLElement>(`[name="${firstBad}"], [data-field="${firstBad}"] input`)?.focus()

  submit.disabled = true
  submit.textContent = 'Saving your seat…'
  let res: Response
  try {
    res = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    formMessage.textContent = 'Could not reach the server, so nothing was booked. Check your connection and try again.'
    return
  } finally {
    submit.disabled = false
    submit.textContent = `Take seat ${current.n}`
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 201) {
    showDone(data.first_name, body.ranking)
    form.reset()
    touched.clear()
    lastRanks = new Map()
  } else if (data.error === 'seat_taken') showTaken()
  else if (data.fields) {
    showErrors(data.fields, true)
    form.querySelector<HTMLElement>(`[name="${Object.keys(data.fields)[0]}"]`)?.focus()
  } else formMessage.textContent = data.message ?? 'Something went wrong on our side. Try again in a moment.'
  refresh()
})

function showDone(firstName: string, vote: string[]) {
  const { t, n } = current!
  $('#done-title').textContent = `You're in, ${firstName}.`
  const rows = [['Table', t.name], ['Seat', String(n)], ['Date', event.dateLabel], ['Doors', event.timeLabel], ['Where', event.venue], ['Your vote', vote.map((id, i) => `${i + 1}. ${gameName(id)}`).join(', ')]]
  const receipt = $('#receipt')
  receipt.replaceChildren(
    ...rows.map(([k, v]) => {
      const div = document.createElement('div')
      div.innerHTML = '<dt></dt><dd></dd>'
      div.firstElementChild!.textContent = k
      div.lastElementChild!.textContent = v
      return div
    }),
  )
  $<HTMLAnchorElement>('#ics').href = `/api/calendar.ics?table=${encodeURIComponent(t.id)}&seat=${n}`
  show('done')
}

sheet.addEventListener('click', (e) => {
  if (e.target === sheet || (e.target as HTMLElement).closest('[data-close]')) sheet.close()
})
sheet.addEventListener('close', () => (current = null))

