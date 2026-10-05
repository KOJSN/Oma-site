/* Oma customer care chat bubble.
   A small button in the corner of every page; it opens a chat with Oma. Nobody
   has to sign in: the database hands back a chat id and a secret, the secret is
   kept in this browser only (and stored hashed on the server), and that pair is
   the whole of "who is this". Oma answers from the admin page.

   Everything checked here is checked again in customer-care.sql (length caps,
   rate limits, the bot trap) because a check that only exists in a page is a
   check anybody can skip. Messages go onto the page with textContent, never
   innerHTML, so nothing a stranger types can become markup.

   Needs /oma-config.js (window.OMA_CFG = {url, anon}) loaded first. */
(function () {
  if (window.__omaCare) return;
  window.__omaCare = true;

  const KEY = "oma_care_v1";
  const NS = "http://www.w3.org/2000/svg";
  let baseTitle = "";
  let chat = null;                 // { chat, secret }
  let after = 0;                   // highest message id the poll has returned
  const seen = new Set();
  let timer = null, polling = false, again = false;
  let lastActive = Date.now(), open = false;
  let unread = 0, titleCount = 0;
  let el = {};

  const cfg = () => {
    const s = window.OMA_CFG || {};
    if (s.url && s.anon) return { url: s.url, anon: s.anon };
    try {
      const c = JSON.parse(localStorage.getItem("oma-cfg") || "{}");
      if (c.url && c.anon) return c;
    } catch (e) { /* private mode */ }
    return null;
  };

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "null");
      return v && v.chat && v.secret ? v : null;
    } catch (e) { return null; }
  }
  function save(v) {
    try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); }
    catch (e) { /* private mode: the chat works, it just will not survive a reload */ }
  }

  async function rpc(fn, args) {
    const c = cfg();
    if (!c) {
      const e = new Error("Customer care is not connected yet. Please try again later.");
      e.offline = true;
      throw e;
    }
    let r;
    try {
      r = await fetch(c.url.replace(/\/$/, "") + "/rest/v1/rpc/" + fn, {
        method: "POST",
        headers: { apikey: c.anon, "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
    } catch (e) {
      const x = new Error("Could not reach Oma. Check your connection and try again.");
      x.net = true;
      throw x;
    }
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* not json */ }
    if (!r.ok) {
      if (r.status === 404 || /could not find the function/i.test(text)) {
        const x = new Error("Customer care is not connected yet. Please try again later.");
        x.offline = true;
        throw x;
      }
      const x = new Error((data && data.message) || "Something went wrong. Please try again.");
      x.status = r.status;
      throw x;
    }
    return data;
  }

  // ── building the page furniture ─────────────────────────────────────
  function h(tag, attrs, kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "class") n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    for (const c of kids || []) n.append(c);
    return n;
  }
  function icon(paths, cls) {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2.2");
    s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    if (cls) s.setAttribute("class", cls);
    for (const d of paths) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d); s.append(p);
    }
    return s;
  }

  function build() {
    const fab = h("button", { class: "oc-fab", type: "button", "aria-label": "Customer care",
      title: "Customer care", "aria-expanded": "false", "aria-controls": "ocPanel" });
    fab.append(
      icon(["M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.1A8.4 8.4 0 1 1 21 11.5Z"], "oc-ic"),
      icon(["M6 6l12 12", "M18 6 6 18"], "oc-x"));
    const dot = h("span", { class: "oc-dot", hidden: "" });
    fab.append(dot);

    const closeBtn = h("button", { class: "oc-close", type: "button", "aria-label": "Close chat" });
    closeBtn.append(icon(["M6 6l12 12", "M18 6 6 18"]));
    const state = h("div", { class: "oc-sub", id: "ocState" });
    const head = h("div", { class: "oc-head" }, [
      h("div", {}, [h("div", { class: "oc-t", text: "Customer care" }), state]), closeBtn]);

    // first message
    const name = h("input", { id: "ocName", name: "name", autocomplete: "name", maxlength: "80", required: "" });
    const contact = h("input", { id: "ocContact", name: "contact", autocomplete: "email", maxlength: "200",
      placeholder: "So we can reach you if you leave" });
    const first = h("textarea", { id: "ocFirst", name: "body", maxlength: "2000", required: "" });
    const company = h("input", { id: "ocCompany", name: "company", tabindex: "-1", autocomplete: "off" });
    const hp = h("div", { class: "oc-hp", "aria-hidden": "true" }, [
      h("label", { for: "ocCompany", text: "Company" }), company]);
    const go = h("button", { class: "oc-go", type: "submit", text: "Start chat" });
    const startNote = h("div", { class: "oc-note", role: "status", "aria-live": "polite" });
    const startForm = h("form", { class: "oc-start", novalidate: "" }, [
      h("p", { class: "oc-intro", text: "A question, a nail tech who wants to join, or something that went wrong? Write here. No sign-in needed." }),
      h("div", {}, [h("label", { for: "ocName", text: "Your name" }), name]),
      h("div", {}, [h("label", { for: "ocContact" }, [document.createTextNode("Email or phone (optional)")]), contact]),
      h("div", {}, [h("label", { for: "ocFirst", text: "Message" }), first]),
      hp, go, startNote]);

    // the conversation
    const log = h("div", { class: "oc-log", role: "log", "aria-live": "polite" });
    const msg = h("textarea", { id: "ocMsg", maxlength: "2000", rows: "1",
      placeholder: "Write a message…", "aria-label": "Your message" });
    const sendBtn = h("button", { class: "oc-sendbtn", type: "submit", text: "Send" });
    const sendForm = h("form", { class: "oc-send", novalidate: "" }, [msg, sendBtn]);
    const note = h("div", { class: "oc-note", role: "status", "aria-live": "polite" });
    const newBtn = h("button", { class: "oc-new", type: "button", text: "Start a new chat" });
    const chatBox = h("div", { class: "oc-chat", hidden: "" }, [log, sendForm, note, newBtn]);

    const panel = h("div", { class: "oc-panel", id: "ocPanel", role: "dialog",
      "aria-label": "Customer care", hidden: "" }, [head, h("div", { class: "oc-body" }, [startForm, chatBox])]);

    document.body.append(panel, fab);
    el = { fab, dot, panel, closeBtn, state, startForm, name, contact, first, company, go, startNote,
           chatBox, log, sendForm, msg, sendBtn, note, newBtn };
  }

  // ── the panel ───────────────────────────────────────────────────────
  function say(node, words) {
    node.textContent = words || "";
    if (words && node.scrollIntoView) node.scrollIntoView({ block: "nearest" });
  }

  function resetLog() {
    el.log.textContent = "";
    el.log.append(h("p", { class: "oc-hint", id: "ocHint",
      text: "We reply here. Keep this page open, or come back to it on this device and your chat will still be here." }));
    seen.clear(); after = 0;
  }

  function badge() {
    el.dot.hidden = !unread;
    el.dot.textContent = unread > 9 ? "9+" : String(unread);
  }

  function setOpen(on) {
    open = on;
    el.panel.hidden = !on;
    el.fab.setAttribute("aria-expanded", on ? "true" : "false");
    el.fab.setAttribute("aria-label", on ? "Close customer care" : "Customer care");
    document.documentElement.classList.toggle("oc-open", on);
    if (on) {
      unread = 0; badge();
      titleCount = 0; document.title = baseTitle;
      fitToViewport();
      if (chat) {
        lastActive = Date.now();
        clearTimeout(timer); poll();
        setTimeout(() => { el.log.scrollTop = el.log.scrollHeight; focusIn(el.msg); }, 30);
      } else {
        setTimeout(() => focusIn(el.name), 30);
      }
    } else {
      schedule();
    }
  }

  // Put the cursor in a field, unless the person has already clicked into one.
  function focusIn(node) {
    if (open && !el.panel.contains(document.activeElement)) node.focus();
  }

  function showChat() { el.startForm.hidden = true; el.chatBox.hidden = false; }
  function showStart(words) {
    el.chatBox.hidden = true; el.startForm.hidden = false;
    say(el.startNote, words);
  }
  function endChat(words) {
    clearTimeout(timer);
    chat = null; save(null); resetLog();
    say(el.note, ""); el.state.textContent = "";
    showStart(words);
  }

  const fmt = (at) => {
    try { return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
    catch (e) { return ""; }
  };

  function addMsg(m) {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    const hint = document.getElementById("ocHint");
    if (hint) hint.remove();
    const stick = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 90;
    el.log.append(h("div", { class: "oc-m " + (m.admin ? "them" : "me") }, [
      h("div", { class: "oc-b", text: m.body }),
      h("div", { class: "oc-ts", text: (m.admin ? "Oma · " : "") + fmt(m.at) })]));
    if (stick || !m.admin) el.log.scrollTop = el.log.scrollHeight;
    return true;
  }

  // Quick while a conversation is moving, slower as it goes quiet, and slow
  // while the panel is shut: enough to put a number on the button when Oma
  // has replied, without hammering the database.
  function delay() {
    const idle = Date.now() - lastActive;
    if (document.hidden) return idle < 1800000 ? 45000 : 0;
    if (!open) return idle < 1800000 ? 20000 : 60000;
    return idle < 120000 ? 4000 : idle < 600000 ? 10000 : idle < 1800000 ? 30000 : 60000;
  }
  function schedule() {
    clearTimeout(timer);
    if (!chat) return;
    const d = delay();
    if (d) timer = setTimeout(poll, d);
  }

  async function poll() {
    if (!chat) return;
    if (polling) { again = true; return; }
    polling = true;
    try {
      const p = await rpc("api_support_poll",
        { p_chat: chat.chat, p_secret: chat.secret, p_after: after });
      if (!p || p.ok === false) {
        return endChat("That chat is no longer available. You can start a new one.");
      }
      let fresh = 0, fromOma = 0;
      for (const m of p.messages || []) {
        if (addMsg(m)) { fresh++; if (m.admin) fromOma++; }
        if (m.id > after) after = m.id;
      }
      if (fresh) lastActive = Date.now();
      el.state.textContent = p.closed ? "Closed. Write again to reopen it." : "";
      if (fromOma && !open) { unread += fromOma; badge(); }
      if (fromOma && document.hidden) {
        titleCount += fromOma;
        document.title = "(" + titleCount + ") " + baseTitle;
      }
      if (el.note.dataset.net) { delete el.note.dataset.net; say(el.note, ""); }
    } catch (e) {
      if (e.net && open) { say(el.note, "Reconnecting…"); el.note.dataset.net = "1"; }
    } finally {
      polling = false;
      if (again) { again = false; poll(); } else schedule();
    }
  }

  // On a phone the chat is full screen and has to shrink with the keyboard.
  function fitToViewport() {
    const vv = window.visualViewport, root = document.documentElement;
    if (!vv || !open) return;
    root.style.setProperty("--oc-vvh", vv.height + "px");
    root.style.setProperty("--oc-vvt", vv.offsetTop + "px");
  }

  function wire() {
    el.fab.addEventListener("click", () => setOpen(!open));
    el.closeBtn.addEventListener("click", () => { setOpen(false); el.fab.focus(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) { setOpen(false); el.fab.focus(); }
    });
    // Any link that used to jump to the contact form now opens the chat.
    document.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest('a[href="#contact"],a[href="/#contact"],a[href="#care"],a[href="/#care"],[data-care-open]');
      if (a) { e.preventDefault(); if (!open) setOpen(true); }
    });
    const fromHash = () => { if (/^#(contact|care)$/.test(location.hash) && !open) setOpen(true); };
    window.addEventListener("hashchange", fromHash);
    if (window.visualViewport) {
      visualViewport.addEventListener("resize", fitToViewport);
      visualViewport.addEventListener("scroll", fitToViewport);
    }

    el.startForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = el.name.value.trim(), contact = el.contact.value.trim(), body = el.first.value.trim();
      if (!name) return say(el.startNote, "What should we call you?");
      if (!body) return say(el.startNote, "Write your message first.");
      el.go.disabled = true;
      say(el.startNote, "Starting…");
      try {
        const r = await rpc("api_support_start", {
          p_name: name, p_contact: contact, p_body: body,
          p_page: location.pathname, p_company: el.company.value,
        });
        chat = { chat: r.chat, secret: r.secret };
        save(chat); resetLog();
        el.startForm.reset(); say(el.startNote, "");
        lastActive = Date.now();
        showChat();
        await poll();
        el.msg.focus();
      } catch (err) {
        say(el.startNote, err.message);
      } finally {
        el.go.disabled = false;
      }
    });

    el.sendForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = el.msg.value.trim();
      if (!body || !chat) return;
      el.sendBtn.disabled = true;
      say(el.note, ""); delete el.note.dataset.net;
      try {
        await rpc("api_support_send", { p_chat: chat.chat, p_secret: chat.secret, p_body: body });
        el.msg.value = "";
        lastActive = Date.now();
        await poll();
      } catch (err) {
        if (/no longer available/i.test(err.message)) endChat(err.message);
        else say(el.note, err.message);
      } finally {
        el.sendBtn.disabled = false;
      }
    });

    // Enter sends on a computer; on a phone Enter stays a new line and the
    // button sends. Shift+Enter is always a new line.
    el.msg.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing
          && window.matchMedia("(pointer:fine)").matches) {
        e.preventDefault();
        el.sendBtn.click();
      }
    });

    el.newBtn.addEventListener("click", () => endChat(""));

    document.addEventListener("visibilitychange", () => {
      if (!chat) return;
      if (!document.hidden) {
        titleCount = 0; document.title = baseTitle;
        lastActive = Date.now();
        clearTimeout(timer); poll();
      } else {
        schedule();
      }
    });
  }

  function start() {
    baseTitle = document.title;
    build(); wire(); resetLog();
    const saved = load();
    if (saved) { chat = saved; showChat(); poll(); }
    if (/^#(contact|care)$/.test(location.hash)) setOpen(true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
