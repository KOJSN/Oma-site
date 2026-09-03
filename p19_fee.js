/* ══ what Oma charges, shown before it is charged ═════
   ₦250 for every completed service, plus 2% of whatever a sale is ABOVE
   ₦30,000. The tech pays it, and she pays the card fee too.

   The database is the authority — api/fee.sql owns the rate, charges it with a
   trigger when the QR is scanned, and records it. This file is a QUOTE: it
   does the same arithmetic in the app so a tech typing a price sees what she
   keeps as she types, without a round trip per keystroke.

   Two copies of a pricing rule is a real risk and it is taken deliberately.
   t_fee.py pins the two together — the numbers here are checked against the
   values api_fee_quote returns, so the day the rate changes in SQL and not
   here, a test fails instead of a tech being quoted the wrong figure. */

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

/* A bill, not a sentence.

   This was one line — "You keep ₦8,515 · Oma ₦250 · card fee ₦235" — and
   Kamsy was right that it is the wrong shape. A tech reading that has to do
   the subtraction herself to believe it. Set out as a receipt, the arithmetic
   is visible and it adds up in front of her:

       ₦9,000     Price
        −₦250     Oma's fee
        −₦235     Paystack
       ₦8,515     You get

   Deductions are written with a real minus sign, not a hyphen, and the amounts
   are right-aligned in a tabular font so the columns line up down the page
   however many digits each number has. */
function keepBill(totalKobo) {
  const t = Math.round(Number(totalKobo) || 0);
  if (!t) return "";
  const oma = omaFeeKobo(t), ps = paystackFeeKobo(t);
  const net = t - oma - ps;
  const row = (label, amount, opts) => `
    <div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0${
      opts && opts.rule ? ";margin-top:4px;padding-top:6px;border-top:1px solid var(--line)" : ""}">
      <span${opts && opts.strong ? ' style="font-weight:800"' : ' class="faint"'}>${label}</span>
      <span style="font-variant-numeric:tabular-nums${
        opts && opts.strong ? ";font-weight:800" : ""}">${amount}</span>
    </div>`;
  return `<div>
    ${row("Price", kobo(t))}
    ${row("Oma's fee", "−" + kobo(oma))}
    ${row("Paystack", "−" + kobo(ps))}
    ${row("You get", kobo(net), { strong: true, rule: true })}
  </div>`;
}

/* ── the same bill, afterwards, in her earnings ──────
   Kamsy: "it would be shown in their diary of past payments". The quote in the
   price editor is a promise; this is the receipt. Same four lines, same order,
   so the number she was shown before she listed is the number she can check
   against her bank afterwards.

   Paystack's share is computed rather than recorded, because Paystack takes it
   at settlement and it never passes through Oma's ledger. It is labelled below
   as what it is. */
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
      <div class="tiny faint" style="margin-bottom:8px">${esc(whenShort(row.paid_at))}</div>
      ${line("Price", kobo(row.total_kobo))}
      ${line("Oma's fee", "−" + kobo(row.oma_kobo))}
      ${line("Paystack", "−" + kobo(row.paystack_kobo))}
      ${line("You got", kobo(row.net_kobo), { strong: true, rule: true })}
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

/* Live as she types. Delegated on the document rather than bound when the
   editor paints, because the service list is re-rendered whenever she adds or
   removes a row and re-bound listeners would be lost or doubled. */
document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el || el.dataset == null || el.dataset.s !== "p") return;
  const slot = document.querySelector(`[data-keep="${el.dataset.i}"]`);
  if (!slot) return;
  // The editor holds naira, because that is what a person types. Everything
  // below this line is kobo, because everything about money in Oma is kobo.
  const naira = Number(String(el.value).replace(/[^0-9.]/g, ""));
  slot.innerHTML = naira > 0 ? keepBill(Math.round(naira * 100)) : "";
});

/* Called after the listing editor paints, so the lines are right before she
   touches anything. */
function drawKeepLines() {
  document.querySelectorAll("[data-keep]").forEach((slot) => {
    const inp = document.querySelector(`[data-s="p"][data-i="${slot.dataset.keep}"]`);
    const naira = inp ? Number(String(inp.value).replace(/[^0-9.]/g, "")) : 0;
    slot.innerHTML = naira > 0 ? keepBill(Math.round(naira * 100)) : "";
  });
}
