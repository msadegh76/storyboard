/* Sending a sign-in link.

   Two ways. With a Resend key in the environment the link is mailed.
   Without one it is printed to the server's log, which is enough to
   run a personal instance with no mail configured at all — and is how
   `pnpm dev` works out of the box. */

/**
 * @typedef {object} Mailer
 * @property {"log" | "resend"} kind
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
