/**
 * Quoted-Printable encoder (RFC 2045 §6.7) for the UTF-8 email parts assembled in
 * `email.service.ts` (`buildMimeMessage`), whose parts declare `charset="UTF-8"`.
 *
 * Non-ASCII characters are emitted as their **UTF-8 bytes** — each byte as `=XX` — rather than as
 * UTF-16 code units. The previous implementation used `charCodeAt` and emitted one hex sequence per
 * code unit, so `€` (U+20AC) became `=20AC` (a decoder reads `=20` → space, then literal `AC`) and
 * NBSP (U+00A0) became a lone `=A0` continuation byte, both of which decode to garbage under
 * `charset="UTF-8"` (the reported `3,99� AC`). Encoding the actual UTF-8 bytes fixes it.
 */
export function toQuotedPrintable(input: string): string {
  // Normalize line endings to CRLF before encoding
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r\n");
  let result = "";
  for (const line of normalized.split("\r\n")) {
    let encoded = "";
    // Iterate by code point (for...of) so surrogate pairs (e.g. emoji) stay intact.
    for (const ch of line) {
      const code = ch.codePointAt(0)!;
      // Encode non-printable ASCII, non-ASCII, and the '=' character
      if (code === 9 || code === 32) {
        // Tab (9) and space (32) are printable but must be encoded at end of line (handled below)
        encoded += ch;
      } else if (code === 61 || code < 33 || code > 126) {
        // '=', control chars, and any non-ASCII char → emit its UTF-8 bytes, each as =XX
        for (const byte of Buffer.from(ch, "utf8")) {
          encoded += `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;
        }
      } else {
        encoded += ch;
      }
    }
    // Trailing whitespace must be encoded in QP
    encoded = encoded.replace(/([ \t]+)$/, (match) =>
      [...match].map((ch) => `=${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`).join("")
    );
    // Soft line breaks at 76 characters (including the trailing =)
    while (encoded.length > 75) {
      // Don't break inside an encoded sequence =XX or leave a dangling =
      let split = 75;
      while (split > 0 && (encoded[split - 1] === "=" || encoded[split - 2] === "=")) {
        split--;
      }
      if (split === 0) split = 75;
      result += encoded.slice(0, split) + "=\r\n";
      encoded = encoded.slice(split);
    }
    result += encoded + "\r\n";
  }
  // Remove trailing CRLF added to last line
  return result.endsWith("\r\n") ? result.slice(0, -2) : result;
}
