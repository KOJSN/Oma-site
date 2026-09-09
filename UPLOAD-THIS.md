# Upload this folder

Everything that needs to go anywhere is in here. Not the
`ios-background-location` folder — that one waits for the App Store build.

Build id: whatever your Actions log prints. It is a hash of an `app.html`
that now carries your own project URL, so it will not match mine — see
section 4.

---

## 1. Supabase — twelve SQL blocks, in this order

Open the SQL editor and run each one. Each is safe to run twice.

| # | File | Saved query name | What it is |
|---|---|---|---|
| 1 | `fee.sql` | **fee** | What Oma charges. **Changed** — run it again even if you ran it before. |
| 2 | `review.sql` | **review** | Stars and reviews. |
| 3 | `live.sql` | **live** | Nail techs with no shop, and the whole-state map. |
| 4 | `hex.sql` | **hex** | Re-run. One line changed. |
| 5 | `search.sql` | **search** | Re-run. The same line. |
| 6 | `home.sql` | **home** | She comes to you. |
| 7 | `admin.sql` | **admin** | The admin page. |
| 8 | `contact.sql` | **contact** | The contact form. |
| 9 | `photo.sql` | **photo** | **New.** Her work under each service. |
| 10 | `menu.sql` | **menu** | **New. This one is urgent — read the box below.** |
| 11 | `psp.sql` | **psp** | **New. The tech pays Paystack's fee, not Oma. Read the box below.** |
| 12 | `points.sql` | **points** | **New.** O points and the leaderboard. Scores nothing until you open a season. |

**Order matters.** Out of order you get *"function ... does not exist"* — not
damage, just run them again in order.

> ### Why `menu.sql` cannot wait
>
> Until now the listing editor saved a nail tech's services to **her phone and
> nowhere else**. `api_add_service` — the database function that would have
> saved them, **lines 316–325 of the `api` saved query in your Supabase SQL
> editor**, and reachable from the app as `API.addService` at line 287 of
> `p12_api.js` — has been sitting there the whole time and nothing ever called
> it. So on the live backend a tech could
> finish her listing, see her prices on her own screen, publish — and a
> customer opening her page saw **no services at all**. Unbookable, silently.
>
> `menu.sql` plus the new `p8_wire.js` fixes it. Any tech who signed up before
> this needs to open her listing and press Save once, which now actually sends
> the menu up.

> ### Why `psp.sql` matters before live keys
>
> The tech was supposed to pay both fees — Oma's and Paystack's. The
> **screens already said so**: the fee quote and the earnings list both showed
> `net = total − oma − paystack`. The **ledger never did.** `release()` moved
> the whole sale into her balance and exactly one deduction followed it, Oma's
> ₦250. Paystack had already taken its cut out of Oma's balance on the way in,
> so **Oma was quietly paying it.**
>
> On your own numbers that is fine on a ₦5,000 set and upside down from about
> ₦10,000: a ₦20,000 booking cost Oma ₦150, a ₦30,000 one cost ₦300. Worst on
> home appointments, and for a reason you chose on purpose — Oma's fee is on
> the services only, never on a tech's petrol, but Paystack's is on the whole
> sale including the call-out and the fare.
>
> `psp.sql` adds the missing second deduction, and takes the figure from what
> **Paystack actually reported** rather than from our copy of its price list —
> so the two can never drift when Paystack reprices. It also re-revokes
> `mark_paid` from `anon`: re-creating a function hands EXECUTE back to PUBLIC,
> and without that line the key inside every copy of the app could mark a
> booking paid without paying.

### Then four more things, on their own

**Set your admin passphrase.** It is at the bottom of `admin.sql`, commented
out. Change the words to your own — **four unrelated words**, long beats
clever — run it, then clear the SQL editor. **Do not send it to me or paste it
anywhere.** I have never seen it and never should.

**Tell Oma who to notify** when someone uses the contact form:

```sql
select id, email from auth.users order by created_at desc limit 5;
insert into admin_owner (user_id) values ('YOUR-ID-HERE') on conflict do nothing;
```

**Redeploy the payment webhook.** Supabase → Edge Functions → `paystack-webhook`
→ paste `paystack-webhook.ts` from this folder → Deploy. It now reads
Paystack's `data.fees` and passes it to `mark_paid`; without it the ledger
falls back to the modelled fee, which is close but not exact.

**Make the photo bucket.** It is the commented block at the very bottom of
`photo.sql` — a public `portfolio` bucket plus the four storage policies that
keep each tech inside her own folder. Uncomment, run, done. Without it the
upload button gives a 400 and nothing else breaks.

---

## 2. GitHub — twenty app files, plus five for the website

Drag these into the **root of the repo**, beside `build.py` and
`oma-config.js` — **not** into a `src/` folder. Your repo is flat
(`github.com/KOJSN/Oma-site/blob/main/p3_core.js`), and earlier versions of
this page said `src/`, which was wrong.

`build.py` reads from `src/` **only if `src/p3_core.js` exists**, and otherwise
from beside itself. So a half-filled `src/` folder is the worst thing that can
happen to this repo: the build silently switches to it and ignores every file
at the root. If one has appeared in there, delete it.

**The app** (these are the ones `build.py` stitches into `app.html`):

```
core_engine.js  p1_head.html    p2_body.html    p3_core.js
p4_result.js    p5_views.js     p6_views2.js    p7_views3.js
p8_wire.js      p12_api.js      p13_money.js    p14_live.js
p16_find.js     p18_review.js   p19_fee.js      p20_live.js
p21_home.js     p22_photos.js   p24_points.js   build.py
```

**`p24_points.js` is a NEW file** — add it rather than looking for it to
overwrite, and upload `build.py` in the same commit, because that is the file
that has to know p24 exists.

**The animation is gone.** If you already uploaded `p23_reveal.js`, `build.py`
no longer reads it — it is a harmless orphan you can delete from the repo when
you next tidy up. `PREVIEW-animation.html` is deleted from this folder too.

**The website** — these go in the **root of the repo**, beside `app.html`.
Nothing builds them; GitHub Pages serves them as they are.

```
index.html      the public site
admin.html      your dashboard
oma-config.js   ← the one file you have to edit. See below.
robots.txt      tells search engines what to index
sitemap.xml     and where to find it
```

Do **not** upload the `.sql` files or this page.

Commit, then wait for the green tick on the Actions tab.

---

## 3. `oma-config.js` — now the ONLY place the backend is named

This is the one file you edit, and it is two lines. It used to configure just
the website. **It now configures the app as well**: `build.py` reads it and
bakes the two values into `app.html`, so nothing has to be typed into a phone
ever again.

That typing step is what caused the listing bug. Three real accounts signed up,
filled in a listing, pressed Save — and because the app had never been pointed
at Supabase, every call went to the practice backend, which stores everything
on the device and cheerfully reports success. The listing looked right on the
phone and the server had no `tech` row at all, which is why Share kept saying
*"list yourself first."* Filling this in fixes that for everyone at once.

In the app, **Settings** now has a single **Practice mode** switch instead of a
form. Off by default, which means a nail tech is on the real Oma from the
moment she opens it.

Open **Supabase → your Oma project → Settings → API** and copy:

- **Project URL** → into `url`
- the **anon** / **public** key → into `anon`

```js
window.OMA_CFG = {
  url:  "https://xxxxxxxx.supabase.co",
  anon: "eyJhbGciOi...",
};
```

Commit it. That is what makes the contact form send and the admin page show
real numbers. Both pages read the same file, so there is one place to fill in
and not two.

**Which key.** The **anon** key. It is public by design — it is already
printed inside every copy of the app on every phone, and every function it can
reach checks who is calling before it answers.

The key underneath it, **service_role**, is a completely different thing. It
bypasses every one of those checks. It must never go in this file, in the app,
in GitHub, or in a chat — **including to me**. If it has ever been anywhere
public, roll it in Supabase today.

### How to tell it worked

Open `omaa.com.ng` and send yourself a message through the contact form.

- *"Sent. Kamsy will get back to you."* → connected.
- *"Not connected: this browser has the settings but oma-config.js does not"* →
  you are seeing your own app's saved settings, not the file. Fill in
  `oma-config.js` and commit.

That second message exists on purpose. The old version would have accepted
your own laptop's saved settings and told you the form worked — while every
real visitor's message went nowhere. The public page now refuses to count
anything but the file that actually ships.

---

## 4. Check it landed

The build id is now a hash of an `app.html` that contains **your** project URL
and anon key, so I cannot tell you in advance what it will be — my build and
yours will never match, and that is correct. What still has to match is these
two against **each other**:

1. `https://omaa.com.ng/` — the site should be there instead of nothing
2. `https://omaa.com.ng/sw.js?x=9` — note the id on the first line
3. The app → **Settings** → the bottom line — **must be the same id**

If those two disagree, the phone is running an old app behind a stale service
worker and the Update bar is what fixes it. That was always what this check
was for.

4. Also in the Actions log: the build prints `backend  https://…supabase.co`.
   If it says **NOT SET**, `oma-config.js` was not filled in and the app has
   shipped in practice mode again.

---

## What is new in the app

### Her work, under her prices

A nail tech's service list is now a photograph. Up to **three** photos per
service, taken or picked on her phone, shrunk to 1200px and about 150 kB
before they leave it — on Nigerian data that is the difference between an
upload finishing and being abandoned.

- The **tick box** is not decoration. She has to say the nails are her own
  work, and that answer is recorded against the photo, not just asked.
- Photos go **live at once**. Any customer can flag one, and you hide it from
  the admin page. Waiting for approval would mean nobody bothers uploading.
- A tech with **no photos looks deliberate, not broken** — her card is the Oma
  gradient with her name, her price and the same *Choose this* button. Not a
  grey box with a torn-picture icon. "That's if she has."

#
## "More" replaces the Profile tab

The Profile tab is gone. In its place is **More** — a list of destinations
and nothing else, because nobody opens an app to look at their own name.

| Bar | Goes to |
|---|---|
| Profile | your details, the screen that was always behind the avatar |
| Leaderboard | O points, the board, your referral code |
| Your scans | scan history — this used to be buried under "See all" |
| (tech) Scan a client's code / Earnings / Verify identity | unchanged |
| (customer) Nail techs near me | unchanged |
| Dark mode · Switch account · Settings | Settings was a cog in the corner |

A nail tech's tab bar is full (Requests, Diary, Scan, Earnings, Listing), so
techs reach More by tapping their avatar on Requests, exactly as before.

**Fixed on the way past:** the scan history screen crashed on any scan saved
before nail-bed wording existed — `sc.words.toLowerCase()` on an undefined
value. It was unreachable enough to go unnoticed; the new "Your scans" bar
put it one tap from the tab bar, so it had to be guarded.

## Referral codes are for new accounts only

Two rules now, and the database enforces both — the app only hides the box,
which is politeness, not security.

1. **One code per person, ever.** Unchanged.
2. **Only before your first completed booking.** Checked on both sides of
   the booking, so a nail tech cannot work a whole season and then be
   "referred" by a friend on the last day.

The payout half was already right and is unchanged: the sender gets 0.3 and
the joiner 0.1, and only when the joiner **completes her first booking** —
not when she installs the app. Proved against a real Postgres: a second
booking does not pay the referral again.

`api_my_points()` now also returns `can_use_code`, which is what the screen
reads. **Re-run `points.sql`** — it is safe to run twice.

## O points, on screen

Settings → **O points and the board**. Her score, her place, the prize
amounts, her referral code with Share and Copy, a box to enter somebody
else's, and the two boards.

Every figure comes from the database — the rate, the prizes, the cap. Nothing
is worked out on the phone, because a score computed locally is a score that
disagrees with the one the prize is actually paid against, and the phone is
the copy she will screenshot. Changing the prize is one UPDATE on the season
row, not a rebuild.

The share link carries the code (`#r=CODE`) so nobody has to read six
characters down a phone; it prefills the box rather than applying itself,
since using a code is a once-ever decision and she has to be signed in for it
to mean anything.

Under every score on the board is how many **different people** it came from.
A big total from one person is what collusion looks like, and it belongs
beside the score rather than being noticed after a million naira has been
paid out.

Until you open a season the screen says so plainly and nothing else appears.

### It stops saying squoval, and stops saying it is not sure

Two lines of arithmetic were doing this, not the rules.

`recommend()` scored confidence as `0.6 × primary + 0.4 × support`, where
support is the average of the OTHER measurements. When the hand model does not
run — which on real photographs is often, it finds no hand at all in roughly
three out of seven — there are no other measurements, and the old code averaged
in a hard **zero**. An absent reading is not a reading of zero. With support
pinned at 0 the sum became `0.6 × primary`, so even a flawless scan topped out
at **0.57**, and anything short of near-perfect agreement fell under the 0.45
threshold and dropped into the squoval fallback.

So it was almost always squoval — not because hands are squoval, but because
the confidence sum punished every scan for a reading it had never asked for.
With nothing to support it, the primary measurement's own confidence is now
the figure, which is the honest one.

**And the fallback is gone.** The ORDER of the ranking is far more robust than
the number under it: the bed ratio moves about ±0.11 between two careful passes
over the same photograph, but the rules score bands rather than points, so a
hand has to sit right on a cut point before that wobble changes which shape
comes first. Refusing to name the top of a ranking we do trust, in favour of a
shape chosen because it offends nobody, threw the answer away.

Your seven study hands, through the shipped engine:

| Hand | Bed | Now says | Then |
|---|---|---|---|
| 1 | 1.20 | Squoval | Squoval |
| 2 | 1.08 | **Oval** | Oval |
| 3 | 1.21 | Squoval | Squoval — *not sure* |
| 4 | 1.03 | **Oval** | Squoval — *not sure* |
| 5 | 1.17 | Squoval | Squoval |
| 6 | 1.19 | Squoval | Squoval — *not sure* |
| 7 | 1.03 | **Oval** | Squoval — *not sure* |

Each one now carries two alternates and a reason drawn from the measurement.

**The "N% fit" badge is gone too.** It was the confidence score with a percent
sign on it. It read as a mark out of a hundred for her nails and was really a
statement about how well four outlines agreed with each other — a number
nobody can act on, in the place on the screen she is most likely to believe.
The badge now names her nail bed instead. The measurements are all still
further down the screen, still saying exactly what they are.

**What has NOT changed: the cut points.** 1.15 and 1.90 still come from the
salon "50% rule" and not from anybody's hands. Every one of your seven measured
between 1.03 and 1.21, which is why the answers cluster the way they do. Moving
those numbers onto real expert judgement is what the two Google Forms are for —
link their responses to a Sheet and I can recalibrate against actual techs
rather than a rule of thumb.

### From ₦∞ — fixed

Your listing showed **From ₦∞** on a service that had a perfectly good price.
Nothing was wrong with the price. Prices are typed by hand, so `5000`, `5,000`
and `₦5,000` all arrive in the same field — and the display code did a bare
`+s.p`, which turns the two with punctuation in them into `NaN`. The line then
said `NaN || Infinity`, and Infinity is a number, so it got printed like one.

There is now one price parser (`priceNum`) and one "cheapest in this menu"
function (`fromPrice`) that returns **null** rather than Infinity when nothing
has a price, and every place that reads a price goes through them — your
listing tile, the customer's tech card, the map pins, the sort. A menu with no
priced service now shows **—**, which is true, instead of ∞, which is not.

### Light mode in the scan

The scan owned the whole screen and was one fixed dark slab in both themes, so
a phone set to light met a black wall the moment you pressed Scan. All four
scan screens follow the theme now — the framing box, the readable-photo card,
the two questions, the tabs and progress bars.

What deliberately does **not** flip is anything drawn on top of your own
photograph: the nail outlines, the crosshair, the loupe rim, the hint pill.
Your photo can be any colour at all, so those keep the contrast that works
over an arbitrary image rather than following the phone.

### The card itself

Full-bleed photograph, her name and duration bottom-left, the price in a pill
bottom-right, swipe for the next one. A card you have chosen gets a pink ring
rather than a pink tint, so it never fights the photograph underneath.

### Light mode on the website

Both site pages follow your phone by default and have a sun/moon button that
overrides it in **both** directions. It remembers.

**Fixed 9 Sep.** Light mode only reached as far as the top bar. Everything
below it — the headline, the buttons, the drawn phone — was one fixed dark
slab in both themes, so switching to light gave you a white bar sitting on a
black wall. Every colour in that band is a token now and every one of them
flips: soft pink ground, dark type, and the phone in light chrome with a white
screen. Dark mode is untouched.

The **sun/moon button now sits immediately beside the Oma wordmark**, top
left. It used to be pushed to the middle of the bar on a phone, because it was
told to shove itself right and then the menu button shoved past it.

*(The admin page keeps its own toggle floating top-right — say the word if you
want that one moved too.)*

### The founder line

Now reads **Oduagu Samben-Nwosu**, in the visible section and in the
structured data Google reads. Initials on the tile changed to **OS**.

Two places still say "Kamsy" in public copy — the line under the contact form
and the *"Sent. Kamsy will get back to you."* confirmation. Tell me if those
should change too; a visitor seeing two different names is the kind of small
thing that reads as careless.

---

## The admin page

`omaa.com.ng/admin.html`. Type your passphrase and you get:

- **Needs looking at** — only the things that are actually stuck. Disputes,
  appointments paid but never scanned (with how old the worst one is), payouts
  waiting, ID checks pending, notifications that gave up.
- **Right now** — techs listed, bookings this week, money in escrow, what Oma
  earned in 30 days
- **Two charts** — bookings a day and money paid in a day. Two, not one with
  two scales: a count and an amount on the same axis invents a relationship
  that is not there.
- **People / Money / Oma's own books**, then **photos** waiting to be checked
  (with Hide and Put it back), your **messages** from the contact form, the
  **newest listings**, and **which states** they are in

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

---

## Google — the search problem

### What changed in the page

The title now reads **"Oma Nails — find a nail tech near you in Nigeria"**.
The word *nails* is in it deliberately: on the bare word *Oma* you are
competing with omaa.com, a real energy company with years of history, and
that fight is not winnable. *Oma nails* is.

Also done: the page declares itself **en-NG** rather than plain English, the
structured data now carries *Oma Nails* as an alternate name, the sitemap has
real dates on it, and the share card has proper alt text and a Nigerian
locale.

**None of that is the thing that was actually wrong.** The reason searching
found an energy company is that there was **nothing at the root of your
domain to index** — the app lives at `/app.html` and `/` was empty. Uploading
`index.html` is the fix. Everything above only decides how well the page does
once it exists.

### What only you can do

1. **search.google.com/search-console**
2. Add property → **URL prefix** → `https://omaa.com.ng`
3. Verify with the **HTML tag** method. Google gives you one
   `<meta name="google-site-verification" ...>` line. In `index.html` there is
   now a comment block marked **GOOGLE SEARCH CONSOLE goes on the line
   below** — delete that comment, paste Google's line in its place, commit,
   then press Verify. It is right under the title so you cannot miss it.
4. Left menu → **Sitemaps** → enter `sitemap.xml` → Submit
5. Left menu → **URL Inspection** → paste `https://omaa.com.ng/` → **Request
   indexing**. This is the one that gets you looked at in days rather than
   weeks.

Indexing still takes days to weeks. What you can realistically win is
*"Oma nails"*, *"book nail tech Lagos"*, *"nail tech near me Nigeria"* — not
*"omaa"*.

**The honest ceiling:** a brand-new page with no other site linking to it
ranks on nothing but its own relevance for a while. The fastest real lever is
not another meta tag — it is one nail tech or one blog linking to
`omaa.com.ng`.

---

## Still to do before real money

- Paystack subaccounts set to `bearer: "subaccount"` — without it the ₦250
  model inverts and you lose money above ₦10,000
- **A Nigerian fintech lawyer on the escrow flow.** Holding other people's
  money between two strangers is CBN territory.
- One real nail tech through the whole thing, end to end.
