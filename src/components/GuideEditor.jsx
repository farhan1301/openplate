import { useState } from 'react'
import { Copy, RotateCcw } from 'lucide-react'
import builtInGuide from '../../docs/MEALS_AGENT.md?raw'
import { saveKitchenGuide } from '../lib/agentAccess'
import { Button, ErrorBanner, Segmented, Sheet } from './ui'
import { cx } from '../lib/cx'

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : null)

const VIEWS = [
  { value: 'live', label: 'What agents read' },
  { value: 'builtin', label: 'Built-in guide' },
]

/**
 * The guide every agent reads first, as an editable, scrollable document.
 * "What agents read" is the live copy (the built-in guide until someone edits
 * it); "Built-in guide" is docs/MEALS_AGENT.md as shipped, read-only, so an
 * edited copy can be compared with it or reset to it.
 */
export default function GuideEditor({ guide, onClose, onSaved, copyText }) {
  const live = guide?.content ?? builtInGuide
  const [view, setView] = useState('live')
  const [text, setText] = useState(live)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const dirty = text !== live
  const customized = Boolean(guide?.customized)
  const shown = view === 'live' ? text : builtInGuide
  const lines = shown.split('\n').length

  const save = async (content) => {
    setSaving(true)
    setError('')
    try {
      await saveKitchenGuide(content, guide?.updated_at ?? null, builtInGuide)
      await onSaved(content === null ? 'Guide reset. Agents read the built-in guide again.' : 'Guide saved. Every agent reads this version from now on.')
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save the guide.')
      setSaving(false)
    }
  }

  const reset = () => {
    if (!window.confirm('Replace the guide agents read with the built-in one? The current text is lost unless you copy it first.')) return
    save(null)
  }

  const copy = async () => {
    setNote((await copyText(shown)) ? 'Copied.' : 'Copy failed: your browser blocked clipboard access.')
  }

  const close = () => {
    if (dirty && !window.confirm('Discard your changes to the guide?')) return
    onClose()
  }

  return (
    <Sheet
      open
      onClose={close}
      title="Agent Guide"
      confirmLabel={saving ? 'Saving…' : 'Save'}
      onConfirm={() => save(text)}
      confirmDisabled={saving || !dirty || !text.trim()}
    >
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <p className="mb-3 px-1 text-[13px] leading-snug text-label-2">
        Every connected agent reads this first, and it’s the first half of “Copy guide + snapshot”. It explains your data,
        the rules and how to coach you. Edit it here, or ask an agent that can make changes to edit it for you.
      </p>

      {customized && <Segmented className="mb-3" options={VIEWS} value={view} onChange={setView} />}

      <p className="mb-2 px-1 text-[13px] text-label-2">
        {view === 'builtin'
          ? `The guide as shipped with the app (docs/MEALS_AGENT.md), ${lines} lines. Read-only: “Use built-in guide” switches agents to it.`
          : customized
            ? `Edited${guide.updated_by ? ` by ${guide.updated_by}` : ''}${guide.updated_at ? ` on ${formatDate(guide.updated_at)}` : ''} · ${lines} lines${dirty ? ' · unsaved changes' : ''}`
            : `The built-in guide · ${lines} lines${dirty ? ' · unsaved changes' : ''}`}
      </p>

      <textarea
        value={shown}
        onChange={e => view === 'live' && setText(e.target.value)}
        readOnly={view !== 'live'}
        spellCheck={false}
        aria-label={view === 'live' ? 'Guide agents read' : 'Built-in guide'}
        className={cx(
          'block h-[55vh] w-full resize-none rounded-[12px] bg-surface p-3 font-mono text-[13px] leading-[1.5] text-label focus:outline-none dark:bg-elevated',
          view !== 'live' && 'text-label-2',
        )}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="md" variant="gray" onClick={copy}><Copy size={15} /> Copy</Button>
        {view === 'live' && dirty && (
          <Button size="md" variant="gray" onClick={() => setText(live)} disabled={saving}>Discard changes</Button>
        )}
        {customized && (
          <Button size="md" variant="danger" onClick={reset} disabled={saving}><RotateCcw size={15} /> Use built-in guide</Button>
        )}
        {note && <span className="text-[13px] text-label-2">{note}</span>}
      </div>
      <p className="mt-3 px-1 text-[13px] text-label-2">
        Markdown. Facts about you (body, goals, diet) belong in About me; the guide is for how agents should help.
      </p>
    </Sheet>
  )
}
