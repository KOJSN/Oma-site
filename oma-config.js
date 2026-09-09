/* ══════════════════════════════════════════════════════════════════════
   The only file on the website you have to edit.

   Fill in the two lines below and the contact form starts sending, and
   the admin page starts showing real numbers. Nothing else on the site
   needs touching, ever.

   ── where to find them ──
   Supabase → your Oma project → Settings → API
     • "Project URL"       → paste into OMA_URL
     • "anon" / "public"   → paste into OMA_ANON

   ── which key ──
   The anon key. It is PUBLIC BY DESIGN: it is already printed inside
   every copy of the app on every phone, and every function it can reach
   checks who is calling before it answers.

   The key underneath it, "service_role", is a completely different
   thing. It bypasses every one of those checks. It must NEVER go in
   this file, in the app, in GitHub, or in a chat — including to me.
   If it has ever been anywhere public, roll it in Supabase today.

   ── how to tell it worked ──
   Open the site and send yourself a message through the contact form.
   If it says "Thank you — we will reply to that address", it is
   connected. If it says it is not connected yet, one of the two lines
   below is still empty or has a typo.
   ══════════════════════════════════════════════════════════════════ */

window.OMA_CFG = {
  url:  "",
  anon: "",
};
