import 'dotenv/config';

/**
 * Zero-network sanity check on how ZADARMA_API_KEY / ZADARMA_API_SECRET were
 * loaded from server/.env. Prints only shape (length, whitespace, wrapping
 * quotes) — never the value itself. Run this before assuming the signing
 * math is wrong; a pasted trailing space or a quote character dotenv didn't
 * strip is a far more common cause of "Not authorized" than a bug in HMAC
 * code that was already verified against an independent re-derivation.
 */
function inspect(name: string, value: string | undefined) {
  if (value === undefined) {
    console.log(`${name}: NOT SET (dotenv did not find this key in server/.env)`);
    return;
  }
  const trimmed = value.trim();
  console.log(`${name}:`);
  console.log(`  length: ${value.length}`);
  console.log(`  has leading/trailing whitespace: ${trimmed.length !== value.length}`);
  console.log(`  starts with a quote char ('/"): ${/^['"]/.test(value)}`);
  console.log(`  ends with a quote char ('/"): ${/['"]$/.test(value)}`);
  console.log(`  contains any whitespace mid-string: ${/\s/.test(trimmed)}`);
  console.log(`  contains non-ASCII characters: ${/[^\x00-\x7F]/.test(value)}`);
}

console.log('=== server/.env loading check (no secret values printed) ===\n');
inspect('ZADARMA_API_KEY', process.env.ZADARMA_API_KEY);
inspect('ZADARMA_API_SECRET', process.env.ZADARMA_API_SECRET);
inspect('ZADARMA_SIP_LOGIN', process.env.ZADARMA_SIP_LOGIN);
