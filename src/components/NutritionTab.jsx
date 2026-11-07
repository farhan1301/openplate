import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Flame, Plus, Target, Trash2 } from 'lucide-react'
import { ActionSheet, AddButton, Button, ErrorBanner, FormGroup, PageHeader, Row, Section, Segmented, Sheet, TextArea, TextInput } from './ui'
import SupplementsCard from './SupplementsCard'
import { cx } from '../lib/cx'
import { normalizedName } from '../lib/kitchen'
import {
  addDays, formatAmount, hasNutrition, MACROS, NUTRIENTS, parseDay, scaleNutrition, SLOTS, slotForNow, sumNutrition, today, useNutrition,
} from '../lib/nutrition'

const dayLabel = (day) => {
  const now = today()
  if (day === now) return 'Today'
  if (day === addDays(now, -1)) return 'Yesterday'
  return parseDay(day).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}

const unitOf = (key) => NUTRIENTS.find(n => n.key === key).unit

/** Progress toward one goal: the track is a lighter step of the fill. Over the goal turns orange and says so. */
function Meter({ value, goal, className }) {
  const over = goal && value > goal
  const share = goal ? Math.min(value / goal, 1) : 0
  return (
    <div className={cx('h-2 overflow-hidden rounded-full', over ? 'bg-orange/20' : 'bg-tint/15', className)}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', over ? 'bg-orange' : 'bg-tint')} style={{ width: `${share * 100}%` }} />
    </div>
  )
}

const leftText = (value, goal, key) => {
  if (!goal) return 'No goal'
  const diff = goal - value
  return diff >= 0 ? `${formatAmount(diff, key)} ${unitOf(key)} left` : `${formatAmount(-diff, key)} ${unitOf(key)} over`
}

function DaySummary({ totals, goals, onSetGoals }) {
  const anyGoal = NUTRIENTS.some(n => goals?.[n.key])
  return (
    <section className="mb-7 rounded-[16px] bg-surface p-4 shadow-card">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-label-2">Calories</p>
          <p className="text-[48px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-label">{formatAmount(totals.calories, 'calories')}</p>
          <p className="mt-1 text-[15px] text-label-2">
            {goals?.calories ? `of ${formatAmount(goals.calories, 'calories')} kcal` : 'kcal eaten'}
          </p>
        </div>
        {goals?.calories ? (
          <p className={cx('pb-1 text-right text-[15px] font-semibold', totals.calories > goals.calories ? 'text-orange' : 'text-label')}>
            {leftText(totals.calories, goals.calories, 'calories')}
          </p>
        ) : null}
      </div>
      {goals?.calories ? <Meter value={totals.calories} goal={goals.calories} className="mt-3" /> : null}

      <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
        {MACROS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[15px] font-medium text-label">{label}</p>
              <p className="text-[13px] tabular-nums text-label-2">
                {formatAmount(totals[key], key)}{goals?.[key] ? ` / ${formatAmount(goals[key], key)}` : ''} g
              </p>
            </div>
            {goals?.[key] ? (
              <>
                <Meter value={totals[key]} goal={goals[key]} className="mt-1.5" />
                <p className={cx('mt-1 text-[12px]', totals[key] > goals[key] ? 'text-orange' : 'text-label-2')}>{leftText(totals[key], goals[key], key)}</p>
              </>
            ) : <p className="mt-1 text-[12px] text-label-3">No goal</p>}
          </div>
        ))}
      </div>

      {!anyGoal && (
        <Button size="md" variant="tinted" className="mt-5" onClick={onSetGoals}><Target size={15} /> Set daily goals</Button>
      )}
    </section>
  )
}

/** Calories per day for the week ending on the selected day. One series, so the title names it; tap a day to open it. */
function WeekChart({ days, goal, selected, onSelect }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(goal || 0, ...days.map(d => d.totals.calories), 1) * 1.1
  const focus = days.find(d => d.day === (hover ?? selected))
  return (
    <Section title="Last 7 days" footer={goal ? `Line: your ${formatAmount(goal, 'calories')} kcal goal. Tap a day to see it.` : 'Tap a day to see it.'}>
      <div className="px-4 pb-3 pt-4">
        <div className="mb-3 min-h-[36px]">
          {focus && (
            <>
              <p className="text-[13px] text-label-2">{dayLabel(focus.day)}</p>
              <p className="text-[15px] tabular-nums text-label">
                <span className="font-semibold">{formatAmount(focus.totals.calories, 'calories')} kcal</span>
                <span className="text-label-2">{` · P ${formatAmount(focus.totals.protein)} · C ${formatAmount(focus.totals.carbs)} · F ${formatAmount(focus.totals.fat)} g`}</span>
              </p>
            </>
          )}
        </div>
        <div className="relative h-36">
          {goal ? (
            <div className="pointer-events-none absolute inset-x-0 border-t border-label-3" style={{ bottom: `${(goal / max) * 100}%` }} />
          ) : null}
          <div className="absolute inset-0 flex items-end gap-0.5 border-b border-separator">
            {days.map(d => {
              const active = d.day === selected
              return (
                <button
                  key={d.day}
                  type="button"
                  onClick={() => onSelect(d.day)}
                  onMouseEnter={() => setHover(d.day)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(d.day)}
                  onBlur={() => setHover(null)}
                  aria-label={`${dayLabel(d.day)}: ${formatAmount(d.totals.calories, 'calories')} kcal`}
                  aria-pressed={active}
                  className="flex h-full flex-1 items-end justify-center"
                >
                  <span
                    className={cx('w-full max-w-6 rounded-t-[4px] transition-colors', active ? 'bg-tint' : 'bg-tint/35', hover === d.day && !active && 'bg-tint/55')}
                    style={{ height: `${(d.totals.calories / max) * 100}%`, minHeight: d.totals.calories ? 2 : 0 }}
                  />
                </button>
              )
            })}
          </div>
        </div>
        <div className="mt-1.5 flex gap-0.5">
          {days.map(d => (
            <span key={d.day} className={cx('flex-1 text-center text-[11px]', d.day === selected ? 'font-semibold text-label' : 'text-label-2')}>
              {parseDay(d.day).toLocaleDateString('en-CA', { weekday: 'narrow' })}
            </span>
          ))}
        </div>
        {/* A table ignores sr-only's 1px width, so the wrapper hides it. */}
        <div className="sr-only">
        <table>
          <caption>Calories and macros per day</caption>
          <thead><tr><th>Day</th>{NUTRIENTS.map(n => <th key={n.key}>{n.label} ({n.unit})</th>)}</tr></thead>
          <tbody>
            {days.map(d => (
              <tr key={d.day}><td>{dayLabel(d.day)}</td>{NUTRIENTS.map(n => <td key={n.key}>{formatAmount(d.totals[n.key], n.key)}</td>)}</tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </Section>
  )
}

const numberText = (value) => (value == null || value === '' ? '' : String(value))
const toNumber = (text) => {
  const n = parseFloat(String(text).replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : 0
}

/** Add or edit one log entry. Picking a saved meal fills in its numbers × servings. */
function EntryEditor({ entry, day, slot, meals, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => ({
    slot: entry?.slot || slot || slotForNow(),
    name: entry?.name || '',
    mealId: entry?.meal_id || null,
    servings: numberText(entry?.servings ?? 1),
    notes: entry?.notes || '',
    ...Object.fromEntries(NUTRIENTS.map(({ key }) => [key, numberText(entry?.[key])])),
  }))
  // Numbers follow the saved meal × servings until they're typed over.
  const [linked, setLinked] = useState(!entry)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const meal = meals.find(m => m.id === form.mealId)
  const set = (key) => (value) => setForm(prev => ({ ...prev, [key]: value }))

  const fillFrom = (source, servings) => Object.fromEntries(
    Object.entries(scaleNutrition(source, toNumber(servings) || 1)).map(([key, value]) => [key, numberText(value)]),
  )

  const pickMeal = (picked) => {
    setForm(prev => ({ ...prev, mealId: picked.id, name: picked.name, ...(hasNutrition(picked) ? fillFrom(picked, prev.servings) : {}) }))
    setLinked(hasNutrition(picked))
    setQuery('')
  }

  const setServings = (value) => setForm(prev => ({
    ...prev,
    servings: value,
    ...(linked && meal && hasNutrition(meal) ? fillFrom(meal, value) : {}),
  }))

  const setNutrient = (key) => (value) => {
    setLinked(false)
    set(key)(value)
  }

  const suggestions = useMemo(() => {
    const q = normalizedName(query)
    if (!q) return []
    return meals
      .filter(m => normalizedName(m.name).includes(q))
      .sort((a, b) => Number(hasNutrition(b)) - Number(hasNutrition(a)) || a.name.localeCompare(b.name))
      .slice(0, 6)
  }, [meals, query])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...(entry ? { id: entry.id } : { eaten_on: day }),
        slot: form.slot,
        name: form.name.trim(),
        meal_id: form.mealId,
        servings: toNumber(form.servings) || 1,
        notes: form.notes.trim() || null,
        ...Object.fromEntries(NUTRIENTS.map(({ key }) => [key, toNumber(form[key])])),
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save this entry.')
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry ? 'Edit Entry' : 'Log Food'}
      confirmLabel={saving ? 'Saving…' : 'Save'}
      onConfirm={save}
      confirmDisabled={saving || !form.name.trim()}
    >
      <ErrorBanner message={error} />
      <Segmented className="mb-6" options={SLOTS} value={form.slot} onChange={set('slot')} />

      <FormGroup
        title="What did you eat?"
        footer={meal
          ? (hasNutrition(meal) ? `From your saved meal “${meal.name}”: numbers are per serving × servings.` : `“${meal.name}” has no nutrition saved yet. Enter it below, or add it in the meal’s editor.`)
          : 'Search your saved meals, or just type a name.'}
      >
        <TextInput value={form.name} onChange={value => { set('name')(value); setQuery(value) }} placeholder="e.g. Paneer Fried Rice" autoFocus={!entry} />
        {suggestions.length > 0 && (
          <div className="border-t border-separator bg-fill/40">
            {suggestions.map(m => (
              <button key={m.id} type="button" onClick={() => pickMeal(m)} className="flex w-full items-center justify-between gap-3 border-b border-separator px-4 py-2.5 text-left last:border-b-0 hover:bg-fill">
                <span className="truncate text-[17px] text-label">{m.name}</span>
                <span className="shrink-0 text-[13px] text-label-2">{hasNutrition(m) ? `${formatAmount(m.calories, 'calories')} kcal / serving` : 'No nutrition yet'}</span>
              </button>
            ))}
          </div>
        )}
        <TextInput label="Servings" value={form.servings} onChange={setServings} type="number" inputMode="decimal" placeholder="1" />
      </FormGroup>

      <FormGroup title="Nutrition for this entry">
        {NUTRIENTS.map(({ key, label, unit }) => (
          <TextInput key={key} label={label} value={form[key]} onChange={setNutrient(key)} type="number" inputMode="decimal" placeholder={unit} />
        ))}
      </FormGroup>

      <FormGroup title="Notes">
        <TextArea value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional" />
      </FormGroup>

      {entry && (
        <>
          <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /> Delete Entry</Button>
          <ActionSheet
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Delete “${entry.name}”?`}
            actions={[{ label: 'Delete Entry', destructive: true, onClick: () => { onDelete(entry); onClose() } }]}
          />
        </>
      )}
    </Sheet>
  )
}

function GoalsEditor({ goals, onClose, onSave }) {
  const [form, setForm] = useState(() => Object.fromEntries(NUTRIENTS.map(({ key }) => [key, numberText(goals?.[key])])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fromMacros = toNumber(form.protein) * 4 + toNumber(form.carbs) * 4 + toNumber(form.fat) * 9

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(Object.fromEntries(NUTRIENTS.map(({ key }) => [key, toNumber(form[key]) || null])))
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save your goals.')
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Daily Goals" confirmLabel={saving ? 'Saving…' : 'Save'} onConfirm={save} confirmDisabled={saving}>
      <ErrorBanner message={error} />
      <FormGroup
        title="Per day"
        footer={`Leave one empty for no goal. Your AI agents can change these too.${fromMacros ? ` Protein, carbs and fat add up to about ${formatAmount(fromMacros, 'calories')} kcal.` : ''}`}
      >
        {NUTRIENTS.map(({ key, label, unit }) => (
          <TextInput key={key} label={label} value={form[key]} onChange={value => setForm(prev => ({ ...prev, [key]: value }))} type="number" inputMode="decimal" placeholder={unit} />
        ))}
      </FormGroup>
      {goals?.updated_by && goals.updated_at && (
        <p className="px-4 text-[13px] text-label-2">
          {`Last changed by ${goals.updated_by} on ${new Date(goals.updated_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}.`}
        </p>
      )}
    </Sheet>
  )
}

const entrySubtitle = (entry) => [
  Number(entry.servings) !== 1 && `${formatAmount(entry.servings)} servings`,
  `P ${formatAmount(entry.protein)} · C ${formatAmount(entry.carbs)} · F ${formatAmount(entry.fat)} g`,
  entry.logged_by !== 'App' && `by ${entry.logged_by}`,
].filter(Boolean).join(' · ')

export default function NutritionTab({ kitchen, showUndo }) {
  const [day, setDay] = useState(today)
  const nutrition = useNutrition(day, 7)
  const [editing, setEditing] = useState(null) // { entry } or { slot } for a new one
  const [goalsOpen, setGoalsOpen] = useState(false)

  const dayEntries = nutrition.entries.filter(e => e.eaten_on === day)
  const totals = sumNutrition(dayEntries)
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = addDays(nutrition.startDay, i)
    return { day: d, totals: sumNutrition(nutrition.entries.filter(e => e.eaten_on === d)) }
  }), [nutrition.entries, nutrition.startDay])

  const remove = async (entry) => {
    try {
      await nutrition.removeEntry(entry)
      const { id: _id, ...rest } = entry
      showUndo({ message: `Deleted “${entry.name}”`, undo: () => nutrition.restoreEntry(rest).catch(() => {}) })
    } catch {
      // The error banner explains it.
    }
  }

  const isToday = day === today()

  return (
    <div>
      <PageHeader title="Nutrition" subtitle={dayLabel(day)}>
        <button type="button" onClick={() => setGoalsOpen(true)} aria-label="Daily goals" title="Daily goals" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-tint shadow-card transition-transform active:scale-95">
          <Target size={18} />
        </button>
        <AddButton onClick={() => setEditing({ slot: slotForNow() })} label="Log Food" />
      </PageHeader>

      <div className="mb-5 flex items-center justify-between rounded-[12px] bg-surface px-2 py-1.5 shadow-card">
        <button type="button" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day" className="flex h-9 w-9 items-center justify-center rounded-full text-tint hover:bg-fill">
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-label">{dayLabel(day)}</span>
          {!isToday && <button type="button" onClick={() => setDay(today())} className="text-[15px] text-tint">Today</button>}
        </div>
        <button type="button" onClick={() => setDay(addDays(day, 1))} disabled={isToday} aria-label="Next day" className="flex h-9 w-9 items-center justify-center rounded-full text-tint hover:bg-fill disabled:opacity-30">
          <ChevronRight size={20} />
        </button>
      </div>

      <ErrorBanner message={nutrition.error} onDismiss={nutrition.clearError} />

      {nutrition.loading ? (
        <div className="h-64 animate-pulse rounded-[16px] bg-surface" />
      ) : (
        <>
          <DaySummary totals={totals} goals={nutrition.goals} onSetGoals={() => setGoalsOpen(true)} />

          <SupplementsCard day={day} showUndo={showUndo} />

          {SLOTS.map(({ value, label }) => {
            const entries = dayEntries.filter(e => e.slot === value)
            const slotCalories = entries.reduce((total, e) => total + Number(e.calories), 0)
            return (
              <Section
                key={value}
                title={entries.length ? `${label} · ${formatAmount(slotCalories, 'calories')} kcal` : label}
                trailing={(
                  <button type="button" onClick={() => setEditing({ slot: value })} className="flex items-center gap-0.5 text-[15px] text-tint hover:opacity-70">
                    <Plus size={15} strokeWidth={2.4} /> Add
                  </button>
                )}
              >
                {entries.length ? entries.map(entry => (
                  <Row
                    key={entry.id}
                    onClick={() => setEditing({ entry })}
                    title={entry.name}
                    subtitle={entrySubtitle(entry)}
                    trailing={<span className="text-[15px] tabular-nums text-label-2">{formatAmount(entry.calories, 'calories')} kcal</span>}
                  />
                )) : (
                  <p className="px-4 py-3 text-[15px] text-label-3">Nothing logged</p>
                )}
              </Section>
            )
          })}

          <WeekChart days={week} goal={nutrition.goals?.calories} selected={day} onSelect={setDay} />

          <p className="flex items-start gap-2 px-1 pb-4 text-[13px] text-label-2">
            <Flame size={15} className="mt-px shrink-0 text-orange" />
            Ask your AI agent to log meals and set goals for you: “I had two slices of pizza for lunch”, “set my protein goal to 150 g”.
          </p>
        </>
      )}

      {editing && (
        <EntryEditor
          entry={editing.entry}
          day={day}
          slot={editing.slot}
          meals={kitchen.meals}
          onClose={() => setEditing(null)}
          onSave={nutrition.saveEntry}
          onDelete={remove}
        />
      )}
      {goalsOpen && <GoalsEditor goals={nutrition.goals} onClose={() => setGoalsOpen(false)} onSave={nutrition.saveGoals} />}
    </div>
  )
}
