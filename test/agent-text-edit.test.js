import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPABASE_URL = 'https://fixture.invalid'
process.env.SUPABASE_ANON_KEY = 'fixture'
const { AgentError, updateGuide } = await import('../api/_lib/meals.js')

const updatedAt = '2026-01-15T12:00:00Z'

function mockGuideRpcs(t, content) {
  const writes = []
  t.mock.method(globalThis, 'fetch', (url, options) => {
    switch (new URL(url).pathname) {
      case '/rest/v1/rpc/get_meals_agent_guide':
        return Response.json({ content, customized: true, updated_at: updatedAt })
      case '/rest/v1/rpc/meals_agent_set_guide':
        writes.push(JSON.parse(options.body))
        return Response.json({})
      default:
        assert.fail(`Unexpected RPC: ${url}`)
    }
  })
  return writes
}

test('overlapping matches reject the edit before writing', async t => {
  const writes = mockGuideRpcs(t, '----')
  await assert.rejects(updateGuide('fixture', { find: '---', replace: '***' }), err =>
    err instanceof AgentError && err.status === 400 &&
    err.message.includes('overlapping positions in the guide. Include more surrounding text so it matches once.'))
  assert.equal(writes.length, 0)
})

test('matching the entire guide writes the replacement once', async t => {
  const writes = mockGuideRpcs(t, '----')
  await updateGuide('fixture', { find: '----', replace: '***' })
  assert.deepEqual(writes, [{ p_token: 'fixture', p_content: '***', p_base_updated_at: updatedAt }])
})

test('non-overlapping duplicates report their count before writing', async t => {
  const writes = mockGuideRpcs(t, 'peas and peas')
  await assert.rejects(updateGuide('fixture', { find: 'peas', replace: 'beans' }), err =>
    err instanceof AgentError && err.status === 400 &&
    err.message.includes('appears 2 times in the guide. Include more surrounding text so it matches once.'))
  assert.equal(writes.length, 0)
})

test('a single match writes the literal replacement and preserves surrounding text', async t => {
  const writes = mockGuideRpcs(t, 'Budget $5 per meal.')
  await updateGuide('fixture', { find: '$5', replace: '$&' })
  assert.deepEqual(writes, [{ p_token: 'fixture', p_content: 'Budget $& per meal.', p_base_updated_at: updatedAt }])
})
