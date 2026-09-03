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

/* The one line a nail tech actually cares about, under the price she typed. */
function keepLine(totalKobo) {
  const t = Math.round(Number(totalKobo) || 0);
  if (!t) return "";
  const oma = omaFeeKobo(t), ps = paystackFeeKobo(t);
  const net = t - oma - ps;
  return `<b>You keep ${kobo(net)}</b> · Oma ${kobo(oma)} · card fee ${kobo(ps)}`;
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
  slot.innerHTML = naira > 0 ? keepLine(Math.round(naira * 100)) : "";
});

/* Called after the listing editor paints, so the lines are right before she
   touches anything. */
function drawKeepLines() {
  document.querySelectorAll("[data-keep]").forEach((slot) => {
    const inp = document.querySelector(`[data-s="p"][data-i="${slot.dataset.keep}"]`);
    const naira = inp ? Number(String(inp.value).replace(/[^0-9.]/g, "")) : 0;
    slot.innerHTML = naira > 0 ? keepLine(Math.round(naira * 100)) : "";
  });
}
