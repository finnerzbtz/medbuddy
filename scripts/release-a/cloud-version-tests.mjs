import { build } from 'esbuild';
import assert from 'node:assert/strict';
await build({
  entryPoints: ['src/cloud/auth.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'rebuild/generated/release-a/cloud-auth-test.js',
  define: {
    'import.meta.env.VITE_NEON_AUTH_URL': '"https://auth.example.test"',
    'import.meta.env.VITE_NEON_DATA_URL': '"https://data.example.test"',
  },
});
const { cloudRpc } = await import('../../rebuild/generated/release-a/cloud-auth-test.js');
let versions = { minSchema: 1, maxSchema: 2, monotonicSchema: true },
  status = 200,
  calls = [];
globalThis.fetch = async (url) => {
  calls.push(url);
  if (url.endsWith('/get-session'))
    return new Response(
      JSON.stringify({
        user: { id: 'owner', email: 'synthetic@example.invalid', emailVerified: true },
        session: {},
      }),
      { status: 200, headers: { 'set-auth-jwt': 'synthetic-jwt' } },
    );
  if (url.endsWith('/reminduh_protocol')) return new Response(JSON.stringify(versions), { status });
  return new Response(JSON.stringify({ revision: 0, data: null }), { status: 200 });
};
for (const version of [
  null,
  { maxSchema: 1, minSchema: 1 },
  { maxSchema: 3, minSchema: 3, monotonicSchema: true },
  { monotonicSchema: true },
]) {
  versions = version;
  status = version ? 200 : 404;
  calls = [];
  await assert.rejects(
    () => cloudRpc('reminduh_save', { payload: {} }, 'owner'),
    /Release A cloud update/,
  );
  assert(!calls.some((url) => url.endsWith('/reminduh_save')));
}
versions = { minSchema: 1, maxSchema: 2, monotonicSchema: true };
status = 200;
calls = [];
await cloudRpc('reminduh_save', { payload: {} }, 'owner');
assert(calls.some((url) => url.endsWith('/reminduh_save')));
console.log(
  '5 cloud version-handshake checks passed; unsupported servers receive no snapshot request.',
);
