# Shhhh... It is a game night

Seat booking for the PG card night. Residents open the link, see one table with 10 chairs, tap an empty chair and book it. While booking, each person ranks the three games (Texas Hold'em, Exploding Kittens, Uno) 1, 2 and 3. The `/admin` page adds up the votes (a 1st choice scores 3 points, a 2nd 2, a 3rd 1) so you know which game to deal. Every booking is saved to a SQLite database and emailed to Harshit. The `/admin` page lists bookings and lets you cancel them, resend emails, export a CSV or download the database.

One small Node service does everything: it serves the page and the API, and stores data in a single SQLite file.

> **Run exactly one instance.** The database is a file on one disk, so never scale this service to more than one replica.

---

## Change the event, the table or the games

- **Event name, date, time, venue, host:** edit `shared/event.ts`. Also update `start` and `end`, which feed the calendar file.
- **Number of chairs:** change `seats` in the `tables` list in the same file and redeploy.
- **Games on the ballot:** edit the `games` list in the same file. The ranking in the form and the vote count in `/admin` follow it automatically.
- **Schedule, house rules and FAQ text:** edit `index.html`.

If you remove a seat that someone has already booked, their booking stays in `/admin`. It just won't show on the map.

## Run it on your computer

You need Node.js 24 from [nodejs.org](https://nodejs.org).

```bash
npm install
cp .env.example .env      # then open .env and set ADMIN_PASSWORD (and RESEND_API_KEY if you have one)
npm run build
npm start                 # http://localhost:3000, admin at http://localhost:3000/admin
npm test                  # double-booking race, validation, privacy, admin, restart
```

While editing the design, run `npm run server` in one terminal and `npm run dev` in another. Then open http://localhost:5173 and changes appear as you save.

---

## Deploy to Railway, step by step

### 1. Put the code on GitHub
Create a new **private** repository on github.com and push this folder to it. `.gitignore` already keeps `node_modules`, `data` and `.env` out.

### 2. Create the Railway project
1. Go to [railway.com](https://railway.com) and sign in with GitHub.
2. Click **New Project → Deploy from GitHub repo** and pick your repository.
3. Railway finds the `Dockerfile` and `railway.json` and starts building. The first build takes a few minutes.

### 3. Add a volume (this is where bookings live)
1. In the project canvas, right-click your service, or press `⌘K`/`Ctrl+K`, and choose **Add Volume**.
2. Set the **mount path** to `/data`.

Without a volume, every redeploy wipes all bookings.

### 4. Set the variables
Open the service, go to the **Variables** tab and add:

| Name | Value |
|---|---|
| `DATABASE_PATH` | `/data/gamenight.db` |
| `ADMIN_PASSWORD` | a long password you'll remember |
| `RESEND_API_KEY` | your key from step 6 (you can add it later) |

You don't need to set `PORT`, because Railway sets it automatically. Saving variables triggers a redeploy.

### 5. Get a public link
Go to **Settings → Networking → Generate Domain**. You'll get something like `game-night-production.up.railway.app`.

- Open `https://<your-domain>/health`. It should say `{"ok":true}`.
- Open `https://<your-domain>/` to see the site.
- Open `https://<your-domain>/admin`. Your browser will ask you to log in: the username is `admin` and the password is your `ADMIN_PASSWORD`.

### 6. Set up email (Resend)
Railway's free plan blocks normal email sending (SMTP), so the app sends email through Resend's web API instead.

1. Sign up at [resend.com](https://resend.com) **using harshitgiis@gmail.com**. Until you verify your own domain, Resend's test sender only delivers to the email address that owns the Resend account. If you sign up with any other address, booking emails will be rejected.
2. Go to **API Keys → Create API Key** (sending access is enough) and copy it.
3. Paste it into Railway as `RESEND_API_KEY`.
4. Make a test booking. The email arrives from `onboarding@resend.dev` with the subject *"New seat booking: The table · Seat 3 · Priya Sharma"*. It includes that person's game vote. Check spam the first time.

**Already have a Resend account under a different email?** Either create a new one with harshitgiis@gmail.com, or add the variable `EMAIL_TO` set to your Resend account's email so booking emails go to you instead.

If an email fails, the booking is still saved. `/admin` shows **Failed** with the reason and a **Resend** button.

*Optional:* after you verify a domain in Resend, set `EMAIL_FROM` (for example `Game Night <bookings@yourdomain.com>`) to send from it. With a domain you could also send guests their own confirmation emails, but that isn't built yet.

### 7. Share it
Paste the link into WhatsApp. The preview shows the event card image (`public/og.jpg`).

### 8. Back up the database
In `/admin`, click **Download database** to save a full copy (`gamenight-YYYY-MM-DD.db`), or **Export CSV** to get a spreadsheet. Do this the night before the event and again afterwards.

You can open the `.db` file with the free [DB Browser for SQLite](https://sqlitebrowser.org).

---

## Troubleshooting

**Deploy fails with `SQLITE_CANTOPEN`, `EACCES: permission denied` or `unable to open database file`**
The app can't write to the volume. Check that:
- the volume's mount path is exactly `/data`;
- `DATABASE_PATH` is `/data/gamenight.db`.

If both are right and it still fails, add the variable `RAILWAY_RUN_UID` = `0` and redeploy. This runs the app as root, which can always write to the volume.

**Bookings disappear after a redeploy**
Either the volume isn't attached or `DATABASE_PATH` is missing, so the database is being written inside the container, which is thrown away on every deploy. Fix steps 3 and 4.

**Emails don't arrive**
Look at the **Email** column in `/admin`, which shows the error.
- `403 ... only send testing emails to your own email address`: your Resend account isn't harshitgiis@gmail.com. Sign up again with that address, or set `EMAIL_TO` to the account's email (see step 6).
- `RESEND_API_KEY is not set`: add the variable.
- `401`: the key is wrong or was deleted.

After fixing it, press **Resend** on each failed booking.

**Health check fails / "Application failed to respond"**
Open **Deployments → View logs**. The app should print `Game night on http://localhost:<port>`. Don't set `PORT` yourself.

**The admin login keeps reappearing**
The username is `admin` (lowercase). To log out, close the browser window.

**WhatsApp shows an old preview or none**
WhatsApp caches previews per link. Try sharing the link with `?v=2` on the end.

**Someone says "Too many tries from here"**
Each network address gets 20 booking attempts per 10 minutes. Everyone on the same PG Wi-Fi shares one address, so if it's busy, wait ten minutes or switch to mobile data. Restarting the service also clears the limit.

---

## How it works

```
shared/event.ts     event details, the table and the games (the file you edit)
shared/validate.ts  form validation, used by both the browser and the server
server/index.ts     Hono server: API, admin, health, static files
server/db.ts        SQLite (WAL mode), migrations, queries
server/email.ts     Resend email
src/                page script, seat-map art, styles, admin page script
test/api.test.ts    runs the real server against a temporary database
```

- **No double booking.** The database has unique indexes on (table, seat) and on phone, covering active bookings only, so a cancelled booking frees both. When two people submit the same seat at the same moment, one gets the seat and the other gets a "seat just taken" message.
- **Privacy.** The public `/api/seats` endpoint returns only table, seat number and first name. Phone, email and room number are only visible in `/admin`.
- **Live seats.** Each open page checks `/api/seats` every 5 seconds while the tab is visible. It also checks when a booking form opens and after every submit.
- **Spam.** There's a hidden honeypot field, a per-network rate limit (kept in memory, so it resets on restart), and request bodies are capped at 10 KB.
