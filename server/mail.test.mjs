/* The SMTP mailer, against a mail server that is nothing but the
   protocol: what goes over the wire, and what happens when the
   password is wrong. */

import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { smtpMailer } from "./mail.js";

const GOOD = Buffer.from("\0ann\0s3cret").toString("base64");

function fakeSmtp() {
  const got = { lines: /** @type {string[]} */ ([]), data: "" };
  const server = net.createServer((s) => {
    let buf = "";
    let inData = false;
    let body = "";
    s.write("220 fake ESMTP\r\n");
    s.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            got.data = body;
            s.write("250 queued\r\n");
          } else body += `${line}\r\n`;
          continue;
        }
        got.lines.push(line);
        if (line.startsWith("EHLO")) s.write("250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
        else if (line.startsWith("AUTH PLAIN")) s.write(line.endsWith(GOOD) ? "235 ok\r\n" : "535 no\r\n");
        else if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO")) s.write("250 ok\r\n");
        else if (line === "DATA") {
          inData = true;
          s.write("354 go\r\n");
        } else if (line === "QUIT") {
          s.write("221 bye\r\n");
          s.end();
        } else s.write("500 what\r\n");
      }
    });
  });
  return new Promise((ok) =>
    server.listen(0, "127.0.0.1", () =>
      ok({ server, port: /** @type {net.AddressInfo} */ (server.address()).port, got }),
    ),
  );
}

test("a sign-in link goes out over SMTP, signed in, as a message a mailbox can read", async () => {
  const { server, port, got } = await fakeSmtp();
  try {
    const mail = smtpMailer(`smtp://ann:s3cret@127.0.0.1:${port}`, "Storyboard <wall@example.com>");
    assert.equal(mail.kind, "smtp");
    const text = "Open this link to sign in:\n\nhttps://wall.example/x\n";
    await mail.send({ to: "bo@example.org", subject: "Your Storyboard sign-in link — now", text, link: "https://wall.example/x" });
    assert.ok(got.lines.includes("MAIL FROM:<wall@example.com>"), "the envelope sender is the bare address");
    assert.ok(got.lines.includes("RCPT TO:<bo@example.org>"));
    const [head, body] = got.data.split("\r\n\r\n");
    assert.match(head, /^From: Storyboard <wall@example.com>\r\n/);
    assert.match(head, /\r\nTo: bo@example.org\r\n/);
    assert.match(head, /\r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/, "a subject with a dash in it is encoded");
    assert.match(head, /\r\nMessage-ID: <[0-9a-f-]+@example.com>\r\n/);
    assert.equal(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8"), text);
  } finally {
    server.close();
  }
});

test("a refused password is an error with the server's words in it", async () => {
  const { server, port } = await fakeSmtp();
  try {
    const mail = smtpMailer(`smtp://ann:wrong@127.0.0.1:${port}`, "wall@example.com");
    await assert.rejects(mail.send({ to: "bo@example.org", subject: "x", text: "y", link: "z" }), /535 no/);
  } finally {
    server.close();
  }
});

test("an address that is not SMTP is refused at startup, not at the first sign-in", () => {
  assert.throws(() => smtpMailer("https://smtp.gmail.com", "x@y"), /smtps:\/\/ or smtp:\/\//);
});
