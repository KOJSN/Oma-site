/* ══ what Oma charges, shown once it has been charged ══
   ₦250 for every completed service, plus 2% of whatever a sale is ABOVE
   ₦30,000. The tech pays it, and she pays the card fee too.

   ── who sees the arithmetic, and when ───────────────────────────────

   Kamsy, 8 Sep 2026: "don't let the customer see the breakdown of price, and
   when a tech wants to set a price let her not see the breakdown — only
   reveal it to a tech when she has been paid, so she can see why she won't
   get the full money."

   So the breakdown lives in exactly ONE place: her earnings, after the
   appointment is done. Not in the price editor, where a running deduction
   beside every box she types in makes setting a price feel like being taxed
   in real time. Not on the customer's screen at all — what Oma takes from a
   tech is between Oma and the tech, and a customer reading it learns nothing
   she can act on.

   The TERMS are still stated in the listing editor, in one sentence, because
   a fee somebody has to be charged to discover is not a fee they agreed to.
   Terms are not a breakdown; the difference is a number that moves as she
   types versus a rule she can read once.

   The database is the authority — api/fee.sql owns the rate, charges it with
   a trigger when the QR is scanned, and records it. The two functions below
   repeat the arithmetic so the receipt can be drawn without a round trip.

   Two copies of a pricing rule is a real risk and it is taken deliberately.
   t_fee.py pins the two together — the numbers here are checked against what
   api_fee_quote returns, so the day the rate changes in SQL and not here, a
   test fails instead of a tech being paid the wrong figure. */

const OMA_FLAT_KOBO = 25000;        // ₦250
const OMA_TIER_KOBO = 3000000;      // ₦30,000 — 2% applies above this
const OMA_TIER_RATE = 0.02;

/* Integer kobo, and rounded the same way the SQL rounds, or the app and the
   database disagree about somebody's money by one kobo — which is a support
   conversation nobody wants to have. */
function omaFeeKobo(total) {
  const t = Math.max(0, Math.round(Number(total) || 0));
  let fee = OMA_FLAT_KOBO;
  if (t > OMA_TIER_KOBO) {
    fee += Math.round((t - OMA_TIER_KOBO) * OMA_TIER_RATE);
  }
  return Math.min(t, fee);          // never more than the sale itself
}

/* Paystack: 1.5% + ₦100, the ₦100 waived under ₦2,500, capped at ₦2,000.
   Shown because the tech bears it. Hiding it would make Oma's ₦250 look like
   the whole cost, and the difference turns up in her bank account instead. */
function paystackFeeKobo(total) {
  const t = Math.max(0, Math.round(Number(total) || 0));
  const f = Math.round(t * 0.015) + (t >= 250000 ? 10000 : 0);
  return Math.min(200000, f);
}

/* ── the receipt, and the only place the deductions appear ──────────
   Drawn once the appointment is scanned and the money is hers. This is where
   "why is it not the full ₦9,000" gets answered, in the one place where the
   answer is a fact rather than a projection:

       ₦9,000     Price
        −₦250     Oma's fee
        −₦235     Paystack
       ₦8,515     You got

   Deductions carry a real minus sign, not a hyphen, and the amounts are
   right-aligned in a tabular font so the columns line up down the page
   however many digits each number has. */
function paidBill(row) {
  const line = (label, amount, opts) => `
    <div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0${
      opts && opts.rule ? ";margin-top:4px;padding-top:6px;border-top:1px solid var(--line)" : ""}">
      <span${opts && opts.strong ? ' style="font-weight:800"' : ' class="faint"'}>${label}</span>
      <span style="font-variant-numeric:tabular-nums${
        opts && opts.strong ? ";font-weight:800" : ""}">${amount}</span>
    </div>`;
  return `
    <div class="card" style="display:block">
      <div class="tiny faint" style="margin-bottom:8px">${esc(whenShort(row.paid_at))}
        ${row.travel_kobo ? "· she went to the client" : ""}</div>
      <!-- On a home visit the price splits in two, because the fee lines
           below apply to them differently: Oma charges on the services only,
           Paystack on the whole card payment. Showing one "Price" line and
           then a fee that is not a percentage of it is how a tech decides she
           is being quietly shorted. -->
      ${row.travel_kobo
        ? line("Services", kobo(row.base_kobo)) + line("Travel and call-out", kobo(row.travel_kobo))
        : ""}
      ${line(row.travel_kobo ? "Client paid" : "Price", kobo(row.total_kobo),
             row.travel_kobo ? { rule: true } : null)}
      ${line("Oma's fee" + (row.travel_kobo ? " (on services)" : ""), "−" + kobo(row.oma_kobo))}
      ${line("Paystack", "−" + kobo(row.paystack_kobo))}
      ${line("You got", kobo(row.net_kobo), { strong: true, rule: true })}
      <!-- The sentence, not just the columns. This screen exists because a
           tech looking at ₦8,515 after quoting ₦9,000 deserves the reason in
           words, once, rather than being left to work out the subtraction and
           wonder whether she was short-changed. -->
      <div class="tiny faint" style="margin-top:8px">
        ${kobo(row.total_kobo)} came in; ${kobo(Number(row.oma_kobo) + Number(row.paystack_kobo))}
        went to Oma and the card, so ${kobo(row.net_kobo)} is yours.</div>
    </div>`;
}

/* Filled in after the wallet paints, like everything else that needs the
   network. A tech with no completed appointments yet is told so plainly. */
async function drawEarnings() {
  const slot = document.getElementById("paidList");
  if (!slot) return;
  let rows;
  try { rows = await API.earnings(30); } catch (e) { return; }
  if (!rows || !rows.length) {
    slot.innerHTML = `<div class="empty"><b>No completed appointments yet</b>
      Once you scan a client's code, what she paid and what you kept appears
      here, appointment by appointment.</div>`;
    return;
  }
  const took = rows.reduce((a, r) => a + Number(r.oma_kobo || 0), 0);
  const got = rows.reduce((a, r) => a + Number(r.net_kobo || 0), 0);
  slot.innerHTML = `
    <div class="lbl mt16">Past payments</div>
    <div class="tiny faint" style="margin:-4px 0 10px">${rows.length} appointment${
      rows.length === 1 ? "" : "s"} · you kept ${kobo(got)} · Oma ${kobo(took)}</div>
    <div class="stack gap12">${rows.map(paidBill).join("")}</div>`;
}

/* There is deliberately nothing here that runs while she is typing a price.
   That used to be a receipt under every box, recalculating on each keystroke.
   It was accurate and it was the wrong screen for it: setting a price is when
   a tech is deciding what she is worth, and a deduction counting itself out
   beside her while she does that is a thing to remove, not to polish. */
