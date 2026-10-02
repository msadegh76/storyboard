/* Sending a sign-in link.

   Three ways. With an SMTP address in the environment the link goes
   out through whatever mailbox or provider that is — a Gmail account
   with an app password will do, and needs no domain. With a Resend key
   it goes through Resend. With neither it is printed to the server's
   log, which is enough to run a personal instance with no mail
   configured at all — and is how `pnpm dev` works out of the box. */

import net from "node:net";
import os from "node:os";
import tls from "node:tls";
import { randomUUID } from "node:crypto";

/**
 * @typedef {object} Mailer
 * @property {"log" | "resend" | "smtp"} kind
 * @property {(m: { to: string, subject: string, text: string, link: string }) => Promise<void>} send
 */

/** @param {{ info: (msg: string) => void }} [log] @returns {Mailer} */
export const logMailer = (log = console) => ({
  kind: "log",
  async send({ to, link }) {
    log.info(`\nstoryboard: sign-in link for ${to}\n  ${link}\n`);
  },
});

/** @param {string} apiKey @param {string} from @returns {Mailer} */
export const resendMailer = (apiKey, from) => ({
  kind: "resend",
  async send({ to, subject, text }) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`the mail could not be sent (Resend said ${res.status})`);
  },
});

/* SMTP, by hand: the eight lines of the protocol a sign-in link needs,
   over TLS. `smtps://user:pass@host:465` is what Gmail (with an app
   password), Brevo, Mailgun and Postmark all accept — no domain to
   verify first, and no package to install. Plain `smtp://` is for a
   relay on the same machine, and for the test.
   ponytail: no STARTTLS (port 587); add it when a provider offers nothing else. */

/** @param {string} url @param {string} from @returns {Mailer} */
export const smtpMailer = (url, from) => {
  const u = new URL(url);
  if (u.protocol !== "smtps:" && u.protocol !== "smtp:")
    throw new Error(`SMTP_URL must start with smtps:// or smtp://, not ${u.protocol}//`);
  const secure = u.protocol === "smtps:";
  const host = u.hostname;
  const port = Number(u.port) || (secure ? 465 : 25);
  const user = decodeURIComponent(u.username);
  const pass = decodeURIComponent(u.password);
  return {
    kind: "smtp",
    async send({ to, subject, text }) {
      const socket = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
      const talk = dialogue(socket);
      try {
        await talk.expect(220);
        await talk.say(`EHLO ${os.hostname() || "storyboard"}`, 250);
        if (user) await talk.say(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass}`).toString("base64")}`, 235);
        await talk.say(`MAIL FROM:<${bare(from)}>`, 250);
        await talk.say(`RCPT TO:<${bare(to)}>`, 250, 251);
        await talk.say("DATA", 354);
        await talk.say(`${message(from, to, subject, text)}\r\n.`, 250);
        await talk.say("QUIT", 221);
      } finally {
        socket.destroy();
      }
    },
  };
};

/* The lockstep of SMTP: one line out, one reply back, the reply's last
   line carrying the code. A reply can run to several lines; only the
   one with a space after the code is the last. */
/** @param {import("node:net").Socket} socket */
function dialogue(socket) {
  let buf = "";
  /** @type {string[]} */
  let reply = [];
  /** @type {{ ok: (lines: string[]) => void, bad: (e: Error) => void }[]} */
  const waiting = [];
  const fail = (/** @type {Error} */ e) => {
    for (const w of waiting.splice(0)) w.bad(e);
  };
  socket.setEncoding("utf8");
  socket.setTimeout(20_000, () => socket.destroy(new Error("the mail server did not answer in time")));
  socket.on("error", fail);
  socket.on("close", () => fail(new Error("the mail server hung up")));
  socket.on("data", (/** @type {string} */ chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      reply.push(line);
      if (/^\d{3}(?: |$)/.test(line)) {
        const lines = reply;
        reply = [];
        waiting.shift()?.ok(lines);
      }
    }
  });
  const expect = async (/** @type {number[]} */ ...codes) => {
    const lines = await /** @type {Promise<string[]>} */ (new Promise((ok, bad) => waiting.push({ ok, bad })));
    const last = lines[lines.length - 1] ?? "";
    if (!codes.includes(Number(last.slice(0, 3))))
      throw new Error(`the mail could not be sent (the mail server said: ${last})`);
    return lines;
  };
  return {
    expect,
    say(/** @type {string} */ line, /** @type {number[]} */ ...codes) {
      socket.write(`${line}\r\n`);
      return expect(...codes);
    },
  };
}

/* The message itself: plain text, sent as base64 so that no byte in
   it can trip a relay, with the headers a mailbox expects to see. */
/** @param {string} from @param {string} to @param {string} subject @param {string} text */
function message(from, to, subject, text) {
  const domain = bare(from).split("@")[1] || "storyboard";
  const head = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${word(subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ];
  const body = Buffer.from(text, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  return `${head.join("\r\n")}\r\n\r\n${body}`;
}

/** A header word that may hold anything: as it is when ASCII, encoded when not. */
const word = (/** @type {string} */ s) =>
  /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

/** The address inside `Name <addr>`, or the string itself. */
const bare = (/** @type {string} */ a) => (a.match(/<([^>]+)>/)?.[1] ?? a).trim();
