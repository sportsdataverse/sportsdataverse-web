// One-shot: create the contact properties lib/survey.ts writes. Resend rejects a
// property key that does not exist, so run this once per account (re-running is
// safe: an existing key returns 4xx and is reported, not fatal).
//
//   RESEND_API_KEY=re_... node scripts/resend-properties.mjs
const KEYS = ['role', 'languages', 'sports', 'discovered_via', 'updates_via', 'news_channel'];
const key = process.env.RESEND_API_KEY;
if (!key) { console.error('RESEND_API_KEY is not set'); process.exit(2); }
let failed = 0;
for (const k of KEYS) {
  const res = await fetch('https://api.resend.com/contact-properties', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ key: k, type: 'string' }),
  });
  const body = await res.text();
  if (res.ok) console.log(`created ${k}`);
  else if (res.status === 409 || /exist/i.test(body)) console.log(`exists  ${k}`);
  else { failed += 1; console.error(`FAILED  ${k}: ${res.status} ${body.slice(0, 120)}`); }
}
process.exit(failed ? 1 : 0);
