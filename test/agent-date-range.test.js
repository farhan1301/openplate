import assert from 'node:assert/strict'
import test from 'node:test'

// The RPC helpers read their configuration when the module loads.
process.env.SUPABASE_URL = 'https://fixture.invalid'
process.env.SUPABASE_ANON_KEY = 'fixture'
const { AgentError, getNutrition } = await import('../api/_lib/meals.js')

test('invalid range dates get a client error before the RPC call', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => Response.json({}))
  for (const [name, value] of [
    ['from', '2026-02-29'],
    ['to', '2024-04-31'],
    ['from', '2026-13-01'],
    ['to', '0000-01-01'],
    ['from', ['2026-10-24']],
    ['to', '2026-1-01'],
  ]) {
    await assert.rejects(async () => getNutrition('fixture', { [name]: value }), err =>
      err instanceof AgentError && err.status === 400 && err.message.includes(name))
  }
  assert.equal(fetch.mock.callCount(), 0)
})

test('valid range dates pass through and optional dates default to null', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => Response.json({}))
  await getNutrition('fixture', { from: '2024-02-29', to: '2024-03-01' })
  await getNutrition('fixture', { to: '' })

  const payloads = fetch.mock.calls.map(call => JSON.parse(call.arguments[1].body))
  assert.deepEqual(payloads, [
    { p_token: 'fixture', p_from: '2024-02-29', p_to: '2024-03-01' },
    { p_token: 'fixture', p_from: null, p_to: null },
  ])
})
