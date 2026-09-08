# Upload this folder

Everything that needs to go anywhere is in here. Nothing else on your computer
needs touching. Not the `ios-background-location` folder — that one is for
when you build the App Store app, and the website has no use for it.

---

## 1. Supabase — six SQL blocks, in this order

Open the SQL editor and run each one. Each is safe to run twice.

| # | File | Saved query name | What it is |
|---|---|---|---|
| 1 | `fee.sql` | **fee** | What Oma charges. **Changed today** — run it even if you ran it before. |
| 2 | `review.sql` | **review** | Stars and reviews. |
| 3 | `live.sql` | **live** | Nail techs with no shop, and the whole-state map. |
| 4 | `hex.sql` | **hex** | Re-run. One line changed. |
| 5 | `search.sql` | **search** | Re-run. The same line. |
| 6 | `home.sql` | **home** | **New.** She comes to you. |

**The order matters.** `live.sql` defines something `hex` and `search` now ask
for; `home.sql` needs the new `fee.sql`. Out of order you get *"function ... does
not exist"* — not damage, just run them again in order.

Each file ends with a commented-out check you can paste in to see it worked.

## 2. GitHub — thirteen files

Drag every `.js`, `.html` and `build.py` from this folder into your repo,
overwriting. Do **not** drag the `.sql` files or this page.

```
p1_head.html   p5_views.js    p7_views3.js   p8_wire.js
p12_api.js     p13_money.js   p14_live.js    p16_find.js
p18_review.js  p19_fee.js     p20_live.js    p21_home.js
build.py
```

`p20_live.js` and `p21_home.js` are new, and **`build.py` has to go with them**
or the app will not build at all.

Commit, then wait for the green tick on the Actions tab.

## 3. Check it landed — 30 seconds, always worth it

1. Open `https://omaa.com.ng/sw.js?x=9` — the first line ends in a build id
2. Open the app → **Settings** → the bottom line says `Build ‹id›`

**They must match.** If they do not, the upload did not go through and there is
no point looking at anything else.

---

## What you will see once it is up

### She comes to you

**As a customer**, on the "pick a time" screen for a tech who travels, there is
now a choice: *I'll go to her* or *She comes to me*. Choose the second and you
get an address box and the price **before** you book:

```
Services                    ₦9,000
Home visit                  ₦3,000
Travel (12.5 km)           ₦16,250
────────────────────────────────────
Total                      ₦28,250
At her place it would be ₦9,000.
```

That last line is deliberate. A number on its own is just a number.

**As a tech**, under your service menu there is a *Going to customers* switch.
Turn it on and you set three things — the call-out (₦3,000), the per-kilometre
(₦1,300) and how far you will go (15 km). All three are yours to change, and
each service gains a *Price at her home* box; leave it blank and it is the same
as your salon price.

The call-out is charged **once a visit**, however many services she books.

### What Oma takes

**Nothing from the travel.** ₦250 comes off the services only. On the example
above Oma charges ₦250 on the ₦9,000, not on the ₦28,250 — the trip is your
time and your petrol. Your earnings receipt now shows it as two lines so you
can see it:

```
Services                    ₦9,000
Travel and call-out        ₦19,250
────────────────────────────────────
Client paid                ₦28,250
Oma's fee (on services)      −₦250
Paystack                     −₦424
────────────────────────────────────
You got                    ₦27,576
```

Paystack **is** on the whole amount, because that is what the card was charged.
Those two really are different numbers and the receipt says so rather than
hiding it.

### The address

She sees your **area and the distance** as soon as you book, so she can decide
whether the trip is worth it. She sees your **street only once you have paid**.
Same rule her own address already follows — which means nobody can collect
people's home addresses by opening booking screens.

### And from earlier

Travelling nail techs (the *Working* switch), the whole-state map, and
customers never pinning a location. All in this same upload.

## Still to do before real money

- Paystack subaccounts set to `bearer: "subaccount"` — without it the ₦250
  model inverts and you lose money on anything over ₦10,000
- A Nigerian fintech lawyer on the escrow flow. Holding other people's money
  between two strangers is CBN territory and that is not a corner to cut.
- One real nail tech through the whole thing, end to end.
