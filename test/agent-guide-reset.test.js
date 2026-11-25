import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPABASE_URL = 'https://fixture.invalid'
process.env.SUPABASE_ANON_KEY = 'fixture'
const { AgentError, updateGuide } = await import('../api/_lib/meals.js')

const guide = {
  content: 'Prefer seasonal vegetables.',
  customized: true,
  updated_at: '2026-01-15T12:00:00Z',
}

function mockGuideRpcs(t) {
  const writes = []
  t.mock.method(globalThis, 'fetch', (url, options) => {
    switch (new URL(url).pathname) {
      case '/rest/v1/rpc/get_meals_agent_guide':
        return Response.json(guide)
      case '/rest/v1/rpc/meals_agent_set_guide':
        writes.push(JSON.parse(options.body))
        return Response.json({})
      default:
        assert.fail(`Unexpected RPC: ${url}`)
    }
  })
  return writes
}

for (const reset of ['false', 'true', null, 1]) {
  test(`reset value ${JSON.stringify(reset)} is rejected before writing the guide`, async t => {
    const writes = mockGuideRpcs(t)
    await assert.rejects(updateGuide('fixture', { reset }), err =>
      err instanceof AgentError && err.status === 400 && err.message.includes('reset: true'))
    assert.equal(writes.length, 0)
  })
}

test('boolean true resets the guide using its current revision', async t => {
  const writes = mockGuideRpcs(t)
  await updateGuide('fixture', { reset: true })
  assert.deepEqual(writes, [{ p_token: 'fixture', p_content: null, p_base_updated_at: guide.updated_at }])
})

test('boolean false allows an append to the current guide', async t => {
  const writes = mockGuideRpcs(t)
  const append = 'Include a shopping list.'
  await updateGuide('fixture', { reset: false, append })
  assert.deepEqual(writes, [{
    p_token: 'fixture',
    p_content: `${guide.content}\n\n${append}\n`,
    p_base_updated_at: guide.updated_at,
  }])
})
