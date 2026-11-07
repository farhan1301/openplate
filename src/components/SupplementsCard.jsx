import { useState } from 'react'
import { Clock, Moon, Pill as PillIcon, Plus, Sun, Sunrise, Sunset, Trash2 } from 'lucide-react'
import { ActionSheet, Button, CheckCircle, ErrorBanner, FormGroup, Pill, Section, Segmented, Sheet, TextArea, TextInput } from './ui'
import { cx } from '../lib/cx'
import { isActive, slotLabel, slotsOf, STATUSES, TIMES, useSupplements } from '../lib/supplements'

const SLOT_ICONS = { morning: Sunrise, midday: Sun, evening: Sunset, bedtime: Moon, any: Clock }

/** Add or edit one supplement: what, how much, when, why, and how to take it. */
function SupplementEditor({ supplement, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => ({
    name: supplement?.name || '',
    dose: supplement?.dose || '',
    times: supplement?.times || [],
    status: supplement?.status || 'taking',
    purpose: supplement?.purpose || '',
    notes: supplement?.notes || '',
    started_on: supplement?.started_on || '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (key) => (value) => setForm(prev => ({ ...prev, [key]: value }))

  const toggleTime = (value) => setForm(prev => ({
    ...prev,
    times: TIMES.map(t => t.value).filter(t => (t === value ? !prev.times.includes(t) : prev.times.includes(t))),
  }))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...(supplement ? { id: supplement.id } : {}),
        name: form.name.trim(),
        dose: form.dose.trim() || null,
        times: form.times,
        status: form.status,
        purpose: form.purpose.trim() || null,
        notes: form.notes.trim() || null,
        started_on: form.started_on || null,
      })
      onClose()
    } catch (err) {
      setError(/duplicate|unique/i.test(err.message || '') ? `You already have a supplement called “${form.name.trim()}”.` : err.message || 'Could not save this supplement.')
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={supplement ? supplement.name : 'Add Supplement'}
      confirmLabel={saving ? 'Saving…' : 'Save'}
      onConfirm={save}
      confirmDisabled={saving || !form.name.trim()}
    >
      <ErrorBanner message={error} />
      <FormGroup>
        <TextInput label="Name" value={form.name} onChange={set('name')} placeholder="e.g. Vitamin D3" autoFocus={!supplement} />
        <TextInput label="Dose" value={form.dose} onChange={set('dose')} placeholder="e.g. 2,000 IU" />
      </FormGroup>

      <FormGroup title="When" footer={form.times.length ? 'Each time is its own tick in the day.' : 'No time picked: taken any time, once a day.'}>
        <div className="flex flex-wrap gap-2 p-3">
          {TIMES.map(({ value, label }) => {
            const active = form.times.includes(value)
            const Icon = SLOT_ICONS[value]
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTime(value)}
                className={cx('flex h-8 items-center gap-1.5 rounded-full px-3 text-[15px] transition-colors', active ? 'bg-tint text-white' : 'bg-fill text-label hover:bg-fill-strong')}
              >
                <Icon size={14} strokeWidth={2.2} /> {label}
              </button>
            )
          })}
        </div>
      </FormGroup>

      <Segmented className="mb-6" options={STATUSES} value={form.status} onChange={set('status')} />

      <FormGroup title="Why">
        <TextInput value={form.purpose} onChange={set('purpose')} placeholder="e.g. Sleep and recovery" />
      </FormGroup>

      <FormGroup title="How to take it" footer="With food or not, spacing from other supplements, tips. Your AI agents can add to these notes.">
        <TextArea value={form.notes} onChange={set('notes')} rows={4} placeholder="e.g. With breakfast; needs some fat to absorb" />
      </FormGroup>

      <FormGroup>
        <TextInput label="Started" type="date" value={form.started_on} onChange={set('started_on')} />
      </FormGroup>

      {supplement?.updated_by && supplement.updated_at && (
        <p className="mb-6 px-4 text-[13px] text-label-2">
          {`Last changed by ${supplement.updated_by} on ${new Date(supplement.updated_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}.`}
        </p>
      )}

      {supplement && (
        <>
          <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /> Remove Supplement</Button>
          <ActionSheet
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Remove “${supplement.name}”?`}
            message="To stop it for now and keep its notes, set it to Paused instead."
            actions={[{ label: 'Remove Supplement', destructive: true, onClick: () => { onDelete(supplement); onClose() } }]}
          />
        </>
      )}
    </Sheet>
  )
}

/** One dose to tick: name, dose and the start of the notes. Tap the text to open it. */
function DoseRow({ supplement, slot, taken, onToggle, onOpen }) {
  return (
    <div className="group relative flex items-start gap-3 pl-4">
      <div className="relative z-[1] pt-3">
        <CheckCircle checked={taken} onClick={onToggle} label={`${supplement.name}, ${slotLabel(slot)}: ${taken ? 'taken' : 'not taken'}`} />
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 border-b border-separator py-2.5 pr-4 text-left group-last:border-b-0 hover:opacity-80"
      >
        <span className="flex items-center gap-2">
          <span className={cx('truncate text-[17px] leading-snug', taken ? 'text-label-2' : 'text-label')}>{supplement.name}</span>
          {supplement.status === 'trying' && <Pill color="indigo">Trying</Pill>}
        </span>
        <span className="block truncate text-[13px] leading-snug text-label-2">{supplement.dose || 'Dose not set'}</span>
        {supplement.notes && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-label-3">{supplement.notes}</span>}
      </button>
    </div>
  )
}

/** Nutrition's supplements card: the day's doses by time of day, ticked off as they're taken. */
export default function SupplementsCard({ day, showUndo }) {
  const supps = useSupplements(day)
  const [editing, setEditing] = useState(null) // { supplement } — null supplement means new

  if (supps.missing) return null

  const active = supps.supplements.filter(isActive)
  const paused = supps.supplements.filter(s => !isActive(s))
  const groups = ['morning', 'midday', 'evening', 'bedtime', 'any']
    .map(slot => ({ slot, items: active.filter(s => slotsOf(s).includes(slot)) }))
    .filter(g => g.items.length)
  const due = groups.reduce((n, g) => n + g.items.length, 0)
  const taken = groups.reduce((n, g) => n + g.items.filter(s => supps.isTaken(s, g.slot)).length, 0)

  const remove = async (supplement) => {
    try {
      await supps.remove(supplement)
      showUndo?.({ message: `Removed “${supplement.name}”`, undo: () => supps.restore(supplement).catch(() => {}) })
    } catch {
      // The error banner explains it.
    }
  }

  return (
    <>
      <ErrorBanner message={supps.error} onDismiss={supps.clearError} />
      <Section
        title={due ? `Supplements · ${taken} of ${due} taken` : 'Supplements'}
        trailing={(
          <button type="button" onClick={() => setEditing({ supplement: null })} className="flex items-center gap-0.5 text-[15px] text-tint hover:opacity-70">
            <Plus size={15} strokeWidth={2.4} /> Add
          </button>
        )}
        footer={supps.supplements.length ? 'Tap one for its dose, why you take it and how. Ask your AI agent to add, change or tick them off: “I took my morning supplements”.' : null}
      >
        {supps.loading ? (
          <div className="h-24 animate-pulse bg-surface" />
        ) : !supps.supplements.length ? (
          <button type="button" onClick={() => setEditing({ supplement: null })} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-fill">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tint/14 text-tint"><PillIcon size={18} strokeWidth={2.2} /></span>
            <span>
              <span className="block text-[17px] text-label">Add your supplements</span>
              <span className="block text-[13px] text-label-2">What you take, how much and when, with notes on how to take it.</span>
            </span>
          </button>
        ) : (
          <>
            {groups.map(({ slot, items }) => {
              const Icon = SLOT_ICONS[slot]
              const done = items.filter(s => supps.isTaken(s, slot)).length
              return (
                <div key={slot}>
                  <div className="flex items-center gap-1.5 bg-fill/40 px-4 py-1.5 text-[13px] font-semibold text-label-2">
                    <Icon size={14} strokeWidth={2.3} className="text-tint" />
                    <span className="flex-1">{slotLabel(slot)}</span>
                    <span className={cx('tabular-nums font-normal', done === items.length && 'text-green')}>{done === items.length ? 'All taken' : `${done} of ${items.length}`}</span>
                  </div>
                  {items.map(supplement => (
                    <DoseRow
                      key={supplement.id}
                      supplement={supplement}
                      slot={slot}
                      taken={supps.isTaken(supplement, slot)}
                      onToggle={() => supps.toggle(supplement, slot)}
                      onOpen={() => setEditing({ supplement })}
                    />
                  ))}
                </div>
              )
            })}
            {paused.length > 0 && (
              <div className="border-t border-separator px-4 py-2.5 text-[13px] text-label-2">
                <span className="font-semibold">Paused: </span>
                {paused.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ', '}
                    <button type="button" onClick={() => setEditing({ supplement: s })} className="text-tint hover:opacity-70">{s.name}</button>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </Section>

      {editing && (
        <SupplementEditor
          supplement={editing.supplement}
          onClose={() => setEditing(null)}
          onSave={supps.save}
          onDelete={remove}
        />
      )}
    </>
  )
}
