import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { runnerImport } from 'vite'

// Vite compiles the JSX; no app config or plugins are needed to render markup.
const { module: ui } = await runnerImport('/src/components/ui.jsx', { configFile: false, logLevel: 'silent' })

const render = (props) => renderToStaticMarkup(h(ui.Sheet, { open: true, onClose() {}, ...props }, 'Body'))
const buttons = (html) => [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)]
  .map(([, attrs, inner]) => ({ attrs, inner }))
const hasName = ({ attrs, inner }) => /aria-label="[^"]+"/.test(attrs) || inner.replace(/<[^>]*>/g, '').trim() !== ''

test('a sheet without a confirm button has no empty, unnamed buttons', () => {
  const html = render({ title: 'Account' })
  assert.ok(buttons(html).every(hasName), html)
  assert.ok(!html.includes('>Cancel<'))
})

test('a sheet with a confirm button keeps its named Cancel button', () => {
  const html = render({ title: 'Log Food', onConfirm() {} })
  assert.ok(buttons(html).every(hasName), html)
  assert.match(html, />Cancel<\/button>/)
  assert.match(html, /role="dialog"[^>]*aria-label="Log Food"/)
})

test('a sheet without a header title is named by its label and renders no empty heading', () => {
  const html = render({ title: '', label: 'Paneer Fried Rice' })
  assert.match(html, /role="dialog"[^>]*aria-label="Paneer Fried Rice"/)
  assert.doesNotMatch(html, /<h2\b[^>]*><\/h2>/)
})
