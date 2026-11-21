import { event, gameName, tables } from '../shared/event.ts'
import { experiences, type BookingRow } from '../shared/validate.ts'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Resend over HTTPS, because Railway blocks outbound SMTP.
export async function sendBookingEmail(b: BookingRow): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  const table = tables.find((t) => t.id === b.table_id)?.name ?? b.table_id
  const booked = new Date(b.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
  const rows: [string, string][] = [
    ['Table', table],
    ['Seat', String(b.seat_number)],
    ['Name', b.full_name],
    ['Room', b.room],
    ['Phone', `<a href="https://wa.me/91${b.phone}" style="color:#7a5c1e">+91 ${b.phone}</a>`],
    ['Email', `<a href="mailto:${esc(b.email)}" style="color:#7a5c1e">${esc(b.email)}</a>`],
    ['Game vote', b.ranking.split(',').map((id, i) => `${i + 1}. ${gameName(id)}`).join(' · ')],
    ['Experience', experiences[b.experience]],
    ['Bringing', b.bringing || '—'],
    ['Notes', b.notes || '—'],
    ['Booked', booked],
  ]
  const safe = new Set(['Phone', 'Email'])
  const html = `<div style="background:#f4efe4;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#1d1b16">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fffdf8;border:1px solid #e2d9c4;border-collapse:collapse">
    <tr><td style="padding:24px 28px 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7a5c1e">${esc(event.name)} · ${esc(event.shortDate)}</td></tr>
    <tr><td style="padding:0 28px 20px;font-family:Georgia,serif;font-size:24px">${esc(table)} · Seat ${b.seat_number}</td></tr>
    <tr><td style="padding:0 28px 24px"><table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-top:1px solid #eee5d2;color:#6b6455;width:110px;vertical-align:top">${k}</td><td style="padding:8px 0;border-top:1px solid #eee5d2">${safe.has(k) ? v : esc(v)}</td></tr>`).join('')}
    </table></td></tr>
  </table></div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Game Night <onboarding@resend.dev>',
      to: [process.env.EMAIL_TO || event.hostEmail],
      reply_to: b.email,
      subject: `New seat booking: ${table} · Seat ${b.seat_number} · ${b.full_name}`,
      html,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Resend replied ${res.status}: ${(await res.text()).slice(0, 300)}`)
}
