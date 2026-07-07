/**
 * Phase 1.1 — email currency garble `3,99� AC` → `3,99 €`.
 *
 * The QP encoder for the UTF-8 email parts must emit UTF-8 *bytes* (each `=XX`), not UTF-16 code
 * units. These tests decode the encoder's output back through a UTF-8 QP decoder and assert the
 * text round-trips — and that the byte sequences are the correct UTF-8 ones (`=E2=82=AC` for `€`,
 * `=C2=A0` for NBSP), never the old `=20AC` / lone `=A0` garble.
 *
 * Run with:  npm --workspace @dezhost/api run build && node --test test/quoted-printable.test.mjs
 */
import assert from "node:assert/strict";
import { test, before } from "node:test";

let toQuotedPrintable;

before(async () => {
  ({ toQuotedPrintable } = await import("../dist/modules/email/quoted-printable.js"));
});

/** Minimal RFC 2045 QP decoder that reconstructs the byte stream, then decodes it as UTF-8. */
function decodeQuotedPrintable(qp) {
  const noSoftBreaks = qp.replace(/=\r\n/g, "");
  const bytes = [];
  for (let i = 0; i < noSoftBreaks.length; i++) {
    const ch = noSoftBreaks[i];
    if (ch === "=") {
      bytes.push(parseInt(noSoftBreaks.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      for (const b of Buffer.from(ch, "utf8")) bytes.push(b);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

test("euro sign round-trips and uses the correct UTF-8 bytes", () => {
  const input = "Total: 3,99 €";
  const encoded = toQuotedPrintable(input);
  assert.equal(decodeQuotedPrintable(encoded), input);
  assert.ok(encoded.includes("=E2=82=AC"), `expected =E2=82=AC, got: ${encoded}`);
  assert.ok(!encoded.includes("=20AC"), "must not emit the buggy UTF-16 code-unit sequence =20AC");
});

test("non-breaking space round-trips as its two UTF-8 bytes, not a lone =A0", () => {
  const input = "3,99 €"; // price NBSP currency, as in the garbled invoices
  const encoded = toQuotedPrintable(input);
  assert.equal(decodeQuotedPrintable(encoded), input);
  assert.ok(encoded.includes("=C2=A0"), `expected =C2=A0 for NBSP, got: ${encoded}`);
});

test("plain ASCII is passed through unchanged", () => {
  const input = "Invoice N-1042 is ready.";
  assert.equal(toQuotedPrintable(input), input);
});

test("the '=' character is encoded as =3D", () => {
  const encoded = toQuotedPrintable("a=b");
  assert.equal(encoded, "a=3Db");
  assert.equal(decodeQuotedPrintable(encoded), "a=b");
});

test("emoji (surrogate pair) round-trips without corruption", () => {
  const input = "Welcome 🎉 to Teculiar";
  const encoded = toQuotedPrintable(input);
  assert.equal(decodeQuotedPrintable(encoded), input);
  assert.ok(encoded.includes("=F0=9F=8E=89"), `expected 4-byte UTF-8 for 🎉, got: ${encoded}`);
});

test("trailing whitespace is encoded", () => {
  assert.equal(toQuotedPrintable("hello "), "hello=20");
  assert.equal(toQuotedPrintable("hello\t"), "hello=09");
});

test("long non-ASCII line soft-wraps to <=76 chars without splitting a =XX triplet", () => {
  const input = "€".repeat(60); // 60 euros → 180 encoded chars, must soft-wrap
  const encoded = toQuotedPrintable(input);
  // Round-trip proves no multi-byte sequence was split across a soft break.
  assert.equal(decodeQuotedPrintable(encoded), input);
  for (const physicalLine of encoded.split("\r\n")) {
    assert.ok(physicalLine.length <= 76, `line exceeds 76: "${physicalLine}" (${physicalLine.length})`);
  }
});
