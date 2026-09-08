# Upload this folder

Everything that needs to go anywhere is in here. Not the
`ios-background-location` folder — that one waits for the App Store build.

---

## 1. Supabase — eight SQL blocks, in this order

Open the SQL editor and run each one. Each is safe to run twice.

| # | File | Saved query name | What it is |
|---|---|---|---|
| 1 | `fee.sql` | **fee** | What Oma charges. **Changed** — run it again even if you ran it before. |
| 2 | `review.sql` | **review** | Stars and reviews. |
| 3 | `live.sql` | **live** | Nail techs with no shop, and the whole-state map. |
| 4 | `hex.sql` | **hex** | Re-run. One line changed. |
| 5 | `search.sql` | **search** | Re-run. The same line. |
| 6 | `home.sql` | **home** | She comes to you. |
| 7 | `admin.sql` | **admin** | **New.** The admin page. |
| 8 | `contact.sql` | **contact** | **New.** The contact form. |

**Order matters.** Out of order you get *"function ... does not exist"* — not
damage, just run them again in order.

### Then two more things, on their own

**Set your admin passphrase.** It is at the bottom of `admin.sql`, commented
out. Change the words to your own — **four unrelated words**, long beats
clever — run it, then clear the SQL editor. **Do not send it to me or paste it
anywhere.** I have never seen it and never should.

**Tell Oma who to notify** when someone uses the contact form. Find your user
id, then add it:

```sql
select id, email from auth.users order by created_at desc limit 5;
insert into admin_owner (user_id) values ('YOUR-ID-HERE') on conflict do nothing;
```

Skip this and messages still arrive — they just wait on the admin page instead
of buzzing your phone.

## 2. GitHub — thirteen app files, plus four for the website

Drag these into your repo, overwriting.

**The app** (these are the ones `build.py` stitches into `app.html`):

```
p1_head.html   p5_views.js    p7_views3.js   p8_wire.js
p12_api.js     p13_money.js   p14_live.js    p16_find.js
p18_review.js  p19_fee.js     p20_live.js    p21_home.js
build.py
```

**The website** — these go in the **root of the repo**, beside `app.html`.
Nothing builds them; GitHub Pages serves them as they are.

```
index.html     the public site
admin.html     your dashboard
robots.txt     tells search engines what to index
sitemap.xml    and where to find it
```

Do **not** upload the `.sql` files or this page.

Commit, then wait for the green tick on the Actions tab.

## 3. Check it landed

1. `https://omaa.com.ng/` — the site should be there instead of nothing
2. `https://omaa.com.ng/sw.js?x=9` — first line ends in a build id
3. The app → **Settings** → the bottom line says `Build ‹id›` — **must match**

---

## The website

`omaa.com.ng/` finally has a page on it. Hero, how it works (with a tab for
customers and one for nail techs), how escrow works, about, you as founder,
the store badges marked *coming soon*, a section for nail techs, and a contact
form.

**Your name is the only personal thing on it.** No city, no university,
nothing I invented. The founder line reads: *"Oma was founded and built to
make booking a nail tech in Nigeria something you can do without knowing her
already."* Change it to whatever you actually want to say — it is one
paragraph in `index.html` near the word `Founder`.

### Why Google showed you an energy company

There was **nothing at `omaa.com.ng/`** to index. No page, no title, no
description. Now there is, plus `robots.txt`, `sitemap.xml` and structured
data naming you as founder.

**One thing only you can do, and it will not happen without you:**

1. Go to **search.google.com/search-console**
2. Add property → **URL prefix** → `https://omaa.com.ng`
3. Verify with the **HTML tag** method — it gives you a `<meta name="google-site-verification" ...>` line. Paste it into `index.html` just under the `<title>`, commit, then click Verify.
4. Left menu → **Sitemaps** → enter `sitemap.xml` → Submit

Then wait. Indexing takes days to weeks, and you will still not outrank
**omaa.com** — that is a real energy company with years of history. What you
can win is *"Oma nails"*, *"book nail tech Lagos"*, *"nail tech near me
Nigeria"*. That is where your customers actually are.

## The admin page

`omaa.com.ng/admin.html`. Type your passphrase and you get:

- **Needs looking at** — only the things that are actually stuck. Disputes,
  appointments paid but never scanned (with how old the worst one is), payouts
  waiting, ID checks pending, notifications that gave up. Nothing stuck and it
  says so in one line instead of a wall of zeroes.
- **Right now** — techs listed, bookings this week, money in escrow, what Oma
  earned in 30 days
- **Two charts** — bookings a day and money paid in a day. Two, not one with
  two scales: a count and an amount on the same axis invents a relationship
  that is not there.
- **People / Money / Oma's own books**, then your **messages** from the
  contact form, the **newest listings**, and **which states** they are in

It refreshes itself every minute while the tab is open.

### What guards it, honestly

The passphrase is checked **in the database**, against a bcrypt hash. It is
never in `admin.html` — that file is public and anything it checked for
itself, anyone could read. Eight wrong tries locks it for fifteen minutes. A
session lasts eight hours, and closing the tab ends it.

It is still **one secret**. Anyone who has it sees everything on that page,
from anywhere, with no second step. That is why the dashboard shows **no
customer names, no addresses and no phone numbers** — numbers, statuses and
money only. The one exception is the contact form inbox, which has to show
what people wrote and the address they wrote from.

**Make the passphrase long.** If it ever leaks, re-run the statement at the
bottom of `admin.sql` — every open session dies with it.

## Still to do before real money

- Paystack subaccounts set to `bearer: "subaccount"` — without it the ₦250
  model inverts and you lose money above ₦10,000
- A Nigerian fintech lawyer on the escrow flow. Holding other people's money
  between two strangers is CBN territory.
- One real nail tech through the whole thing, end to end.
