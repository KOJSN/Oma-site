/* ══ 15 messages ══════════════════════════════════════════════════════════
   The one thing the app could not do at all: let the two people involved in an
   appointment speak to each other. WhatsApp came out and nothing replaced it,
   so a customer stuck in traffic on Third Mainland had no way to say so.

   A thread IS a booking. There is no way to open a conversation with a tech
   you have not booked — which is the whole anti-spam design, and the reason
   nobody needs a block list. See chat.sql.

   It polls rather than streams, every few seconds while the thread is open and
   never otherwise. For "I am fifteen minutes late" that is fast enough, and it
   avoids opening a second route into the message table just to save four
   seconds. If it ever needs to be instant, that is a deliberate change with
   its own security review, not something to bolt on quietly.              */

let CHATID = null;    // the booking whose thread is open
let CHATPOLL = null;  // the timer, which must not outlive the screen
let CHATN = -1;       // how many messages were on screen last time

/* paint() throws the screen away; the timer would keep firing at a log that is
   no longer there, and keep asking the server for a conversation nobody is
   reading. Cleared on every navigation, next to stopMap. */
function stopChat() {
  if (CHATPOLL) { clearInterval(CHATPOLL); CHATPOLL = null; }
  CHATID = null;
  CHATN = -1;
}

const chatTime = (iso) => hhmm(new Date(iso).getTime());

/* Grouped by day, because "3:40 pm" with no day is a lie after midnight. */
function bubbles(list) {
  let day = "";
  return list.map((m) => {
    const at = new Date(m.at).getTime();
    const d = dayLabel(at);
    const sep = d === day ? "" : `<div class="daysep">${esc(d)}</div>`;
    day = d;
    return `${sep}
      <div class="bub ${m.mine ? "me" : "them"}">${esc(m.body)}
        <span class="when">${chatTime(m.at)}</span></div>`;
  }).join("");
}

function paintChat(list) {
  const log = document.getElementById("chatlog");
  if (!log) return;
  // Only stick to the bottom if she was already there. Yanking her back down
  // while she is reading something further up is the classic chat annoyance.
  const atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const first = CHATN < 0;

  log.innerHTML = list.length ? bubbles(list) : `
    <div class="empty" style="margin:auto"><div class="ic">${I.chat()}</div>
      <b>No messages yet</b>
      Say hello. It arrives inside Oma, not on anybody's phone number.</div>`;

  if (first || atEnd) log.scrollTop = log.scrollHeight;
  CHATN = list.length;
}

function vChat(bookingId) {
  load(async () => {
    if (!API.signedIn()) return askToSignIn("this conversation");

    const [all, list] = await Promise.all([
      API.bookings(true),
      API.messages(bookingId),
    ]);
    const b = all.find((x) => x.id === bookingId);
    if (!b) {
      return fillHost(`<div class="pad"><div class="note">
        <div>That appointment is gone, so the conversation went with it.</div>
      </div></div>`);
    }

    const asTech = b.role === "tech";
    const who = asTech ? (b.customer_name || "A customer") : b.tech.business_name;
    const at = new Date(b.starts_at).getTime();
    // The same rule chat.sql enforces, said here so the box is not offered and
    // then refused.
    const open = !["cancelled", "expired", "refunded"].includes(b.status) &&
                 at > Date.now() - 30 * 864e5;

    fillHost(`
      <div class="chathead">
        <button class="iconbtn" data-a="back" aria-label="Back">${I.back()}</button>
        <div class="avatar sq">${esc(initials(who))}</div>
        <div style="flex:1;min-width:0">
          <div class="ttl">${esc(who)}</div>
          <div class="tiny sub">${dayLabel(at)} · ${hhmm(at)}</div>
        </div>
        <button class="iconbtn" data-a="go" data-v="job" data-id="${esc(b.id)}"
                aria-label="The appointment">${I.cal()}</button>
      </div>
      <div class="chatlog" id="chatlog"></div>
      ${open ? `
      <div class="composer">
        <textarea id="msgIn" rows="1" placeholder="Message ${esc(who)}"
                  maxlength="2000" aria-label="Your message"></textarea>
        <button class="send" data-a="send-msg" data-id="${esc(b.id)}"
                aria-label="Send">${I.send()}</button>
      </div>`
      : `<div class="composer" style="justify-content:center">
           <div class="tiny sub" style="text-align:center;padding:6px 0">
             This appointment is closed, so the conversation is too.</div>
         </div>`}`);

    paintChat(list);
    CHATID = bookingId;
    API.readThread(bookingId).catch(() => { /* a badge, not the point */ });

    const grow = document.getElementById("msgIn");
    if (grow) {
      // A message is usually one line and occasionally five.
      grow.addEventListener("input", () => {
        grow.style.height = "auto";
        grow.style.height = Math.min(grow.scrollHeight, 120) + "px";
      });
    }

    if (CHATPOLL) clearInterval(CHATPOLL);
    CHATPOLL = setInterval(async () => {
      if (CHATID !== bookingId || document.hidden) return;
      try {
        const fresh = await API.messages(bookingId);
        if (fresh.length !== CHATN) {
          paintChat(fresh);
          API.readThread(bookingId).catch(() => {});
        }
      } catch (e) { /* one bad poll on a Lagos connection is not an error */ }
    }, 4000);
  });

  // No head() here: the thread has its own bar with the other person on it.
  return host();
}

/* Called by the send button and by Enter on a keyboard. */
async function sendMessage(bookingId) {
  const box = document.getElementById("msgIn");
  if (!box) return;
  const body = box.value.trim();
  if (!body) return;

  const btn = document.querySelector('.composer .send');
  if (btn) btn.disabled = true;
  box.value = "";
  box.style.height = "auto";
  try {
    await API.send(bookingId, body);
    paintChat(await API.messages(bookingId));
  } catch (e) {
    // Put her words back rather than swallowing them.
    box.value = body;
    toast(e && e.message ? e.message : "That did not send.");
  } finally {
    if (btn) btn.disabled = false;
  }
}
