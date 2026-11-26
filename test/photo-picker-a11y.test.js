import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { runnerImport } from 'vite'

// Use the demo client so rendering the editor needs no Supabase configuration.
process.env.VITE_DEMO = 'true'
const { module: { PhotoField } } = await runnerImport('/src/components/FoodImage.jsx', {
  configFile: false,
  logLevel: 'silent',
})

for (const [value, text] of [['', 'Add Photo'], ['/fixture-photo.png', 'Change Photo']]) {
  test(`${text} exposes a labeled, keyboard-focusable file input`, () => {
    const html = renderToStaticMarkup(h(PhotoField, { value, onChange() {}, name: 'Tomato Soup' }))
    const uploadLabel = [...html.matchAll(/<label\b([^>]*)>(.*?)<\/label>/g)]
      .find(([, , content]) => content.includes('type="file"'))

    assert.ok(uploadLabel, 'file input should be inside its label')
    const [, labelAttrs, labelContent] = uploadLabel
    const fileInput = labelContent.match(/<input\b[^>]*type="file"[^>]*>/)[0]
    assert.ok(labelContent.includes(text))
    assert.match(fileInput, /class="sr-only"/)
    assert.doesNotMatch(fileInput, /\b(?:disabled|hidden|tabindex)\b/i)
    assert.match(labelAttrs, /focus-within:outline-2\b/)
  })
}
