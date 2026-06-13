import net from "node:net";
import tls from "node:tls";

export type ImapMailboxConfig = {
  address: string;
  // Department slug this mailbox maps to (e.g. "sales", "support").
  department: string;
  enabled?: boolean;
  host?: string;
  mailbox?: string;
  password?: string;
  port?: number;
  secure?: boolean;
  username?: string;
};

export type ImapMessage = {
  body: string;
  from?: string;
  subject: string;
  to?: string;
  uid: string;
};

export async function fetchUnreadImapMessages(config: ImapMailboxConfig) {
  if (!config.enabled || !config.host || !config.username || !config.password) {
    return [];
  }
  const socket = await connectImap(config);
  const client = imapClient(socket);
  try {
    await client.readGreeting();
    await client.command(`LOGIN ${quote(config.username)} ${quote(config.password)}`);
    await client.command(`SELECT ${quote(config.mailbox || "INBOX")}`);
    const search = await client.command("UID SEARCH UNSEEN");
    const uids = search.match(/\* SEARCH ([^\r\n]*)/)?.[1]?.trim().split(/\s+/).filter(Boolean) ?? [];
    const messages: ImapMessage[] = [];
    for (const uid of uids) {
      const raw = await client.command(`UID FETCH ${uid} BODY.PEEK[]`);
      const message = parseMessageLiteral(raw);
      if (!message) {
        continue;
      }
      messages.push({ ...parseRfc822(message), uid });
      await client.command(`UID STORE ${uid} +FLAGS.SILENT (\\Seen)`).catch(() => undefined);
    }
    return messages;
  } finally {
    await client.command("LOGOUT").catch(() => undefined);
    socket.end();
  }
}

function connectImap(config: ImapMailboxConfig) {
  const port = Number(config.port || 993);
  const host = config.host ?? "127.0.0.1";
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = config.secure === false
      ? net.connect({ host, port })
      : tls.connect({ host, port, rejectUnauthorized: false });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("IMAP connection timed out"));
    }, 10_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.setTimeout(10_000);
      socket.once("timeout", () => socket.destroy(new Error("IMAP response timed out")));
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function imapClient(socket: net.Socket) {
  let tagCounter = 1;
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
  });

  return {
    readGreeting() {
      return waitFor(() => /^\* OK/m.test(buffer), () => buffer);
    },
    async command(command: string) {
      const tag = `A${String(tagCounter++).padStart(4, "0")}`;
      buffer = "";
      socket.write(`${tag} ${command}\r\n`);
      const response = await waitFor(() => new RegExp(`^${tag} (OK|NO|BAD)`, "m").test(buffer), () => buffer);
      if (new RegExp(`^${tag} (NO|BAD)`, "m").test(response)) {
        throw new Error(`IMAP command failed: ${response.split(/\r?\n/).at(-2) ?? command}`);
      }
      return response;
    }
  };
}

function waitFor(done: () => boolean, value: () => string) {
  return new Promise<string>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (done()) {
        clearInterval(timer);
        resolve(value());
        return;
      }
      if (Date.now() - started > 10_000) {
        clearInterval(timer);
        reject(new Error("IMAP response timed out"));
      }
    }, 20);
  });
}

function parseMessageLiteral(raw: string) {
  const match = raw.match(/\{(\d+)\}\r?\n/);
  if (!match?.[1] || match.index === undefined) {
    return undefined;
  }
  const start = match.index + match[0].length;
  return raw.slice(start, start + Number(match[1]));
}

function parseRfc822(raw: string) {
  const [headerBlock = "", ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const headers = parseHeaders(headerBlock);
  return {
    body: cleanupBody(bodyParts.join("\n\n")),
    from: emailAddress(headers.from),
    subject: decodeMimeWords(headers.subject ?? "Email ticket"),
    to: headers.to
  };
}

function parseHeaders(value: string) {
  const lines = value.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/);
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index <= 0) {
      continue;
    }
    headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

function cleanupBody(value: string) {
  return value
    .replace(/--[a-zA-Z0-9'()+_,./:=?-]+--?/g, "")
    .replace(/Content-[^\n]+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function emailAddress(value?: string) {
  return value?.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();
}

function decodeMimeWords(value: string) {
  return value.replace(/=\?utf-8\?b\?([^?]+)\?=/gi, (_, encoded: string) => Buffer.from(encoded, "base64").toString("utf8"));
}

function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
