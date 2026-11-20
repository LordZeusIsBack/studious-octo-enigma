// The one file to edit: event details, the table(s) and the games people vote on.
// The server validates bookings against these lists and the page draws them.

export const event = {
  name: 'Shhhh... It is a game night',
  pitch: 'Ten chairs, three games, one rule: keep it down.',
  start: '2026-12-05T22:30:00+05:30',
  end: '2026-12-06T01:00:00+05:30',
  dateLabel: 'Saturday, 5 December',
  shortDate: 'Sat 5 Dec',
  timeLabel: '10:30 pm',
  venue: 'Room 2007',
  entry: 'Free',
  host: 'Harshit',
  hostEmail: 'harshitgiis@gmail.com',
}

export type GameTable = { id: string; name: string; seats: number; blurb: string }

export const tables: GameTable[] = [
  {
    id: 'main',
    name: 'The table',
    seats: 10,
    blurb: 'One table, one lamp, ten chairs. Pick yours, then rank the games. The one you all want most gets dealt.',
  },
]

// Everyone ranks these 1, 2, 3 when they book. The id also picks the game's colours in the CSS.
export type Game = { id: string; name: string; blurb: string; duration: string; skill: string }

export const games: Game[] = [
  {
    id: 'holdem',
    name: "Texas Hold'em",
    blurb: 'No-limit, chips only, nothing real on the line except your pride. Quiet, slow, full of long stares.',
    duration: 'Until the last chip',
    skill: 'Learn in one hand',
  },
  {
    id: 'kittens',
    name: 'Exploding Kittens',
    blurb: 'Draw a card and hope it does not go off. Fast rounds, sudden betrayals, no hard feelings.',
    duration: '15 min rounds',
    skill: 'None needed',
  },
  {
    id: 'uno',
    name: 'Uno',
    blurb: 'Match the colour, match the number, ruin a friendship. The loudest option on the list.',
    duration: '20 min rounds',
    skill: 'You already know it',
  },
]

export const gameName = (id: string) => games.find((g) => g.id === id)?.name ?? id
export const totalSeats = tables.reduce((n, t) => n + t.seats, 0)
