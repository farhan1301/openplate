import { useMemo, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Dumbbell, Minus, Moon, Plus, Scale, Target, Trash2, X } from 'lucide-react'
import { ActionSheet, AddButton, Button, EmptyState, ErrorBanner, FormGroup, PageHeader, Row, Section, Segmented, Sheet, TextArea, TextInput } from './ui'
import { cx } from '../lib/cx'
import { pluralize } from '../lib/kitchen'
import { addDays, parseDay, today } from '../lib/nutrition'
import {
  addMonths, buildCalendar, exerciseSummary, formatDays, INTENSITIES, KINDS, monthEnd, monthStart, mondayOf, sortDays, STATUSES, useFitness, weekdayOf, WEEKDAYS,
} from '../lib/fitness'

const dayLabel = (day) => {
  const now = today()
  if (day === now) return 'Today'
  if (day === addDays(now, -1)) return 'Yesterday'
  return parseDay(day).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })
}

const numberText = (value) => (value == null || value === '' ? '' : String(value))
const toNumber = (text) => {
  const n = parseFloat(String(text ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null
}
const toInt = (text) => {
  const n = toNumber(text)
  return n == null ? null : Math.round(n)
}

// ---------- marks ----------

/** The tick / cross / rest / planned mark used in the week strip and the calendar. */
function DayMark({ status, size = 28, children }) {
  const style = { width: size, height: size }
  const icon = Math.round(size * 0.55)
  if (status === 'done') {
    return <span style={style} className="flex items-center justify-center rounded-full bg-green text-white"><Check size={icon} strokeWidth={3.2} /></span>
  }
  if (status === 'missed') {
    return <span style={style} className="flex items-center justify-center rounded-full bg-red/14 text-red"><X size={icon} strokeWidth={3.2} /></span>
  }
  if (status === 'rest') {
    return <span style={style} className="flex items-center justify-center rounded-full bg-fill text-label-2"><Moon size={icon - 2} strokeWidth={2.4} /></span>
  }
  if (status === 'planned') {
    return <span style={style} className="flex items-center justify-center rounded-full border-[1.5px] border-dashed border-tint text-[13px] text-label">{children}</span>
  }
  return <span style={style} className="flex items-center justify-center text-[13px] text-label-2">{children}</span>
}

const STATUS_WORDS = { done: 'worked out', missed: 'missed', rest: 'rest day', planned: 'gym day planned' }

function Meter({ value, goal, className }) {
  const share = goal ? Math.min(value / goal, 1) : 0
  const hit = goal && value >= goal
  return (
    <div className={cx('h-2 overflow-hidden rounded-full', hit ? 'bg-green/20' : 'bg-tint/15', className)}>
      <div className={cx('h-full rounded-full transition-[width] duration-500', hit ? 'bg-green' : 'bg-tint')} style={{ width: `${share * 100}%` }} />
    </div>
  )
}

// ---------- summary ----------

function WeekCard({ calendar, goals, stats, onSetGoals, onOpenDay }) {
  const monday = mondayOf(today())
  const done = calendar.weekCount(monday)
  const goal = goals?.days_per_week
  const left = goal ? Math.max(goal - done, 0) : null
  const daysLeft = 6 - (parseDay(today()).getDay() + 6) % 7
  return (
    <section className="mb-7 rounded-[16px] bg-surface p-4 shadow-card">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-label-2">This week</p>
          <p className="text-[48px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-label">
            {done}{goal ? <span className="text-[28px] text-label-3">/{goal}</span> : null}
          </p>
          <p className="mt-1 text-[15px] text-label-2">{done === 1 && !goal ? 'gym day' : 'gym days'}</p>
        </div>
        {goal ? (
          <p className={cx('pb-1 text-right text-[15px] font-semibold', left === 0 ? 'text-green' : 'text-label')}>
            {left === 0 ? 'Goal hit 🎉' : `${left} to go · ${pluralize(daysLeft + (calendar.statusOf(today()) === 'done' ? 0 : 1), 'day')} left`}
          </p>
        ) : null}
      </div>
      {goal ? <Meter value={done} goal={goal} className="mt-3" /> : null}

      <div className="mt-4 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => {
          const day = addDays(monday, i)
          const status = calendar.statusOf(day)
          return (
            <button
              key={w.value}
              type="button"
              onClick={() => onOpenDay(day)}
              aria-label={`${dayLabel(day)}: ${STATUS_WORDS[status] || 'nothing logged'}`}
              className="flex flex-col items-center gap-1 rounded-[10px] py-1 hover:bg-fill"
            >
              <span className={cx('text-[11px]', day === today() ? 'font-semibold text-tint' : 'text-label-2')}>{w.label}</span>
              <DayMark status={status} size={30}>{parseDay(day).getDate()}</DayMark>
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-separator pt-3 text-center">
        <div>
          <p className="text-[20px] font-semibold tabular-nums text-label">{stats.streak ?? '–'}</p>
          <p className="text-[12px] leading-tight text-label-2">{goal ? 'weeks on goal' : 'set a goal for streaks'}</p>
        </div>
        <div>
          <p className="text-[20px] font-semibold tabular-nums text-label">{stats.last30}</p>
          <p className="text-[12px] leading-tight text-label-2">gym days, last 30</p>
        </div>
        <div>
          <p className="text-[20px] font-semibold tabular-nums text-label">{stats.daysSince == null ? '–' : stats.daysSince === 0 ? 'Today' : stats.daysSince}</p>
          <p className="text-[12px] leading-tight text-label-2">{stats.daysSince == null || stats.daysSince === 0 ? 'last workout' : 'days since workout'}</p>
        </div>
      </div>

      {!goal && (
        <Button size="md" variant="tinted" className="mt-4" onClick={onSetGoals}><Target size={15} /> Set training goals</Button>
      )}
    </section>
  )
}

/** Today: what's planned, and one-tap done / skipped / rest. */
function TodayCard({ calendar, goals, routines, onLog, onEdit }) {
  const day = today()
  const status = calendar.statusOf(day)
  const logged = calendar.byDay.get(day) || []
  const planned = routines.filter(r => (r.days || []).includes(weekdayOf(day)))
  const unit = goals?.weight_unit || 'kg'
  const isGymDay = (goals?.gym_days || []).includes(weekdayOf(day)) || planned.length > 0

  return (
    <Section title="Today" footer={!logged.length && isGymDay ? 'Did it? Tap the tick. Your AI agent can log the details: “I did push day, bench 4×8 at 155”.' : undefined}>
      {logged.map(w => (
        <Row
          key={w.id}
          onClick={() => onEdit(w)}
          leading={<DayMark status={w.status === 'skipped' ? 'missed' : w.status} size={28} />}
          title={w.title || STATUSES.find(s => s.value === w.status)?.label}
          subtitle={workoutSubtitle(w)}
          chevron
        />
      ))}
      {!logged.length && planned.map(r => (
        <div key={r.id} className="border-b border-separator px-4 py-3 last:border-b-0">
          <p className="text-[17px] font-semibold text-label">{r.name}</p>
          {r.focus && <p className="text-[13px] text-label-2">{r.focus}</p>}
          {(r.exercises || []).length > 0 && (
            <ul className="mt-2 space-y-1">
              {r.exercises.map((e, i) => (
                <li key={i} className="flex justify-between gap-3 text-[15px]">
                  <span className="text-label">{e.name}</span>
                  <span className="shrink-0 tabular-nums text-label-2">{exerciseSummary(e, unit)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {!logged.length && !planned.length && (
        <p className="px-4 py-3 text-[15px] text-label-2">{isGymDay ? 'Gym day. No routine planned for today.' : 'Nothing planned today.'}</p>
      )}
      {status !== 'done' && (
        <div className="flex flex-wrap gap-2 border-t border-separator px-4 py-3">
          <Button size="md" variant="green" onClick={() => onLog({ status: 'done', routine: planned[0] })}><Check size={16} strokeWidth={3} /> {planned[0] ? `Did ${planned[0].name}` : 'Worked out'}</Button>
          {status !== 'missed' && <Button size="md" variant="danger" onClick={() => onLog({ status: 'skipped' })}><X size={16} strokeWidth={3} /> Skipped</Button>}
          {status !== 'rest' && <Button size="md" variant="gray" onClick={() => onLog({ status: 'rest' })}><Moon size={15} /> Rest day</Button>}
        </div>
      )}
    </Section>
  )
}

const workoutSubtitle = (w) => [
  w.kind && KINDS.find(k => k.value === w.kind)?.label,
  w.duration_minutes ? `${w.duration_minutes} min` : null,
  w.intensity && INTENSITIES.find(i => i.value === w.intensity)?.label,
  w.calories_burned ? `${Math.round(w.calories_burned)} kcal` : null,
  (w.exercises || []).length ? pluralize(w.exercises.length, 'exercise') : null,
  w.logged_by && w.logged_by !== 'App' ? `by ${w.logged_by}` : null,
].filter(Boolean).join(' · ')

function MonthCalendar({ month, onMonth, calendar, onOpenDay }) {
  const first = monthStart(month)
  const last = monthEnd(month)
  const lead = (parseDay(first).getDay() + 6) % 7
  const days = []
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d)
  const counts = days.reduce((acc, d) => {
    const s = calendar.statusOf(d)
    if (s) acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})
  const isCurrent = first === monthStart(today())

  return (
    <Section
      title="Calendar"
      footer={`${pluralize(counts.done || 0, 'gym day')}${counts.missed ? ` · ${counts.missed} missed` : ''}${counts.rest ? ` · ${pluralize(counts.rest, 'rest day')}` : ''} in ${parseDay(first).toLocaleDateString('en-CA', { month: 'long' })}. Tap a day to log or edit it.`}
    >
      <div className="px-3 pb-3 pt-2">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => onMonth(addMonths(month, -1))} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-full text-tint hover:bg-fill">
            <ChevronLeft size={20} />
          </button>
          <span className="text-[15px] font-semibold text-label">{parseDay(first).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}</span>
          <button type="button" onClick={() => onMonth(addMonths(month, 1))} disabled={isCurrent} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-full text-tint hover:bg-fill disabled:opacity-30">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAYS.map(w => <span key={w.value} className="pb-1 text-[11px] font-medium text-label-2">{w.narrow}</span>)}
          {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} />)}
          {days.map(d => {
            const status = calendar.statusOf(d)
            const future = d > today()
            return (
              <button
                key={d}
                type="button"
                onClick={() => onOpenDay(d)}
                disabled={future}
                aria-label={`${dayLabel(d)}: ${STATUS_WORDS[status] || 'nothing logged'}`}
                className={cx('flex h-11 items-center justify-center rounded-[10px] hover:bg-fill disabled:hover:bg-transparent', d === today() && 'bg-tint/10')}
              >
                {status && status !== 'planned'
                  ? <DayMark status={status} size={30} />
                  : <DayMark status={status} size={30}><span className={cx(future && 'text-label-3', d === today() && 'font-semibold text-tint')}>{parseDay(d).getDate()}</span></DayMark>}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-label-2">
          <span className="flex items-center gap-1.5"><DayMark status="done" size={16} /> Worked out</span>
          <span className="flex items-center gap-1.5"><DayMark status="missed" size={16} /> Missed</span>
          <span className="flex items-center gap-1.5"><DayMark status="rest" size={16} /> Rest</span>
          <span className="flex items-center gap-1.5"><DayMark status="planned" size={16} /> Planned</span>
        </div>
      </div>
    </Section>
  )
}

function BodySection({ body, goals, onLog, onEdit }) {
  const unit = goals?.weight_unit || 'kg'
  const weighIns = body.filter(b => b.weight != null)
  const latest = weighIns[weighIns.length - 1]
  const monthAgo = weighIns.filter(b => b.measured_on <= addDays(today(), -28)).pop()
  const change = latest && monthAgo ? Math.round((latest.weight - monthAgo.weight) * 10) / 10 : null
  const toTarget = latest && goals?.target_weight ? Math.round((latest.weight - goals.target_weight) * 10) / 10 : null
  const recent = [...body].reverse().slice(0, 5)

  return (
    <Section
      title="Body"
      trailing={(
        <button type="button" onClick={onLog} className="flex items-center gap-0.5 text-[15px] text-tint hover:opacity-70">
          <Plus size={15} strokeWidth={2.4} /> Weigh in
        </button>
      )}
    >
      {latest ? (
        <div className="flex items-end justify-between gap-3 border-b border-separator px-4 py-3">
          <div>
            <p className="text-[13px] text-label-2">{`Weight · ${dayLabel(latest.measured_on)}`}</p>
            <p className="text-[28px] font-semibold leading-tight tabular-nums text-label">{latest.weight} <span className="text-[17px] text-label-2">{unit}</span></p>
          </div>
          <div className="pb-1 text-right text-[13px] text-label-2">
            {change != null && <p className="tabular-nums">{`${change > 0 ? '+' : ''}${change} ${unit} in 4 weeks`}</p>}
            {toTarget != null && <p className="tabular-nums">{toTarget === 0 ? 'At your target' : `${Math.abs(toTarget)} ${unit} ${toTarget > 0 ? 'above' : 'below'} target ${goals.target_weight}`}</p>}
          </div>
        </div>
      ) : (
        <p className="border-b border-separator px-4 py-3 text-[15px] text-label-2">No weigh-ins yet.</p>
      )}
      {recent.map(b => (
        <Row
          key={b.id}
          onClick={() => onEdit(b)}
          title={dayLabel(b.measured_on)}
          subtitle={[b.body_fat ? `${b.body_fat}% body fat` : null, b.notes, b.logged_by !== 'App' ? `by ${b.logged_by}` : null].filter(Boolean).join(' · ') || undefined}
          trailing={<span className="text-[15px] tabular-nums text-label-2">{b.weight != null ? `${b.weight} ${unit}` : '–'}</span>}
        />
      ))}
    </Section>
  )
}

// ---------- editors ----------

const blankExercise = () => ({ name: '', sets: '', reps: '', weight: '' })
const toExerciseForm = (list) => (list || []).map(e => ({ ...e, sets: numberText(e.sets), reps: numberText(e.reps), weight: numberText(e.weight) }))
const fromExerciseForm = (list) => list
  .filter(e => e.name.trim())
  .map(({ name, sets, reps, weight, duration_minutes, distance_km, notes }) => Object.fromEntries(Object.entries({
    name: name.trim(),
    sets: toInt(sets),
    reps: String(reps ?? '').trim() || null,
    weight: toNumber(weight),
    duration_minutes: duration_minutes ?? null,
    distance_km: distance_km ?? null,
    notes: notes || null,
  }).filter(([, v]) => v != null && v !== 0)))

function SmallInput({ label, value, onChange, inputMode = 'decimal' }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col rounded-[8px] bg-fill px-2 py-1">
      <span className="text-[11px] text-label-2">{label}</span>
      <input value={value} inputMode={inputMode} onChange={e => onChange(e.target.value)} className="min-w-0 bg-transparent text-[15px] tabular-nums text-label focus:outline-none" />
    </label>
  )
}

function ExercisesEditor({ value, onChange, unit, title = 'Exercises', footer }) {
  const update = (i, key) => (text) => onChange(value.map((e, j) => (j === i ? { ...e, [key]: text } : e)))
  return (
    <FormGroup title={title} footer={footer}>
      {value.map((e, i) => (
        <div key={i} className="border-b border-separator px-4 py-2 last:border-b-0">
          <div className="flex items-center gap-2">
            <input
              value={e.name}
              onChange={ev => update(i, 'name')(ev.target.value)}
              placeholder="Exercise, e.g. Bench press"
              className="h-9 min-w-0 flex-1 bg-transparent text-[17px] text-label placeholder:text-label-3 focus:outline-none"
            />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${e.name || 'exercise'}`} className="flex h-7 w-7 items-center justify-center rounded-full text-red hover:bg-red/10">
              <Minus size={16} strokeWidth={2.6} />
            </button>
          </div>
          <div className="mt-1 flex gap-2">
            <SmallInput label="Sets" value={e.sets} onChange={update(i, 'sets')} inputMode="numeric" />
            <SmallInput label="Reps" value={e.reps} onChange={update(i, 'reps')} inputMode="text" />
            <SmallInput label={`Weight (${unit})`} value={e.weight} onChange={update(i, 'weight')} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, blankExercise()])} className="flex h-11 w-full items-center gap-2 px-4 text-[17px] text-tint hover:bg-fill">
        <Plus size={18} /> Add exercise
      </button>
    </FormGroup>
  )
}

function WorkoutEditor({ workout, defaults, routines, unit, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => ({
    done_on: workout?.done_on || defaults?.day || today(),
    status: workout?.status || defaults?.status || 'done',
    routine_id: workout?.routine_id ?? defaults?.routine?.id ?? null,
    title: workout?.title || defaults?.routine?.name || '',
    kind: workout?.kind || (defaults?.routine ? 'strength' : null),
    duration_minutes: numberText(workout?.duration_minutes),
    intensity: workout?.intensity || null,
    calories_burned: numberText(workout?.calories_burned),
    exercises: toExerciseForm(workout?.exercises || defaults?.routine?.exercises),
    notes: workout?.notes || '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (key) => (value) => setForm(prev => ({ ...prev, [key]: value }))
  const done = form.status === 'done'

  const pickRoutine = (routine) => setForm(prev => ({
    ...prev,
    routine_id: routine?.id || null,
    title: routine ? routine.name : prev.title,
    kind: routine ? prev.kind || 'strength' : prev.kind,
    exercises: routine && !prev.exercises.some(e => e.name.trim()) ? toExerciseForm(routine.exercises) : prev.exercises,
  }))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...(workout ? { id: workout.id } : {}),
        done_on: form.done_on,
        status: form.status,
        title: form.title.trim() || (form.status === 'skipped' ? 'Skipped' : form.status === 'rest' ? 'Rest day' : 'Workout'),
        routine_id: done ? form.routine_id : null,
        kind: done ? form.kind : null,
        duration_minutes: done ? toInt(form.duration_minutes) : null,
        intensity: done ? form.intensity : null,
        calories_burned: done ? toNumber(form.calories_burned) : null,
        exercises: done ? fromExerciseForm(form.exercises) : [],
        notes: form.notes.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save this workout.')
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={workout ? 'Edit Workout' : 'Log Workout'} confirmLabel={saving ? 'Saving…' : 'Save'} onConfirm={save} confirmDisabled={saving}>
      <ErrorBanner message={error} />
      <Segmented className="mb-6" options={STATUSES} value={form.status} onChange={set('status')} />

      <FormGroup>
        <TextInput label="Date" type="date" value={form.done_on} onChange={value => value && set('done_on')(value)} />
        {done && <TextInput label="Title" value={form.title} onChange={set('title')} placeholder="e.g. Leg day, 5 km run" />}
      </FormGroup>

      {done && (
        <>
          {routines.length > 0 && (
            <FormGroup title="Routine" footer="Picking a routine fills in its exercises. Change them to what you actually did.">
              <div className="flex flex-wrap gap-2 p-3">
                {[{ id: null, name: 'None' }, ...routines].map(r => (
                  <button
                    key={r.id || 'none'}
                    type="button"
                    onClick={() => pickRoutine(r.id ? r : null)}
                    className={cx('h-8 rounded-full px-3 text-[15px] transition-colors', form.routine_id === r.id ? 'bg-tint text-white' : 'bg-fill text-label hover:bg-fill-strong')}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </FormGroup>
          )}

          <FormGroup title="Type">
            <ChoiceChips options={KINDS} value={form.kind} onChange={set('kind')} />
          </FormGroup>

          <FormGroup title="Session">
            <TextInput label="Minutes" value={form.duration_minutes} onChange={set('duration_minutes')} type="number" inputMode="numeric" placeholder="e.g. 60" />
            <TextInput label="Burned" value={form.calories_burned} onChange={set('calories_burned')} type="number" inputMode="decimal" placeholder="kcal (optional)" />
            <ChoiceChips options={INTENSITIES} value={form.intensity} onChange={set('intensity')} />
          </FormGroup>

          <ExercisesEditor value={form.exercises} onChange={set('exercises')} unit={unit} title="What you did" />
        </>
      )}

      <FormGroup title="Notes">
        <TextArea value={form.notes} onChange={set('notes')} rows={2} placeholder={done ? 'How it felt, PRs, pain…' : 'Why? (optional)'} />
      </FormGroup>

      {workout && (
        <>
          <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /> Delete</Button>
          <ActionSheet
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Delete “${workout.title || 'this entry'}”?`}
            actions={[{ label: 'Delete', destructive: true, onClick: () => { onDelete(workout); onClose() } }]}
          />
        </>
      )}
    </Sheet>
  )
}

/** Wrapping single-choice chips; tapping the active one clears it. */
function ChoiceChips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2 p-3">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(value === o.value ? null : o.value)}
          aria-pressed={value === o.value}
          className={cx('h-8 rounded-full px-3 text-[15px] transition-colors', value === o.value ? 'bg-tint text-white' : 'bg-fill text-label hover:bg-fill-strong')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DayPicker({ value, onChange }) {
  const toggle = (day) => onChange(sortDays(value.includes(day) ? value.filter(d => d !== day) : [...value, day]))
  return (
    <div className="grid grid-cols-7 gap-1.5 p-3">
      {WEEKDAYS.map(w => (
        <button
          key={w.value}
          type="button"
          onClick={() => toggle(w.value)}
          aria-pressed={value.includes(w.value)}
          className={cx('h-9 rounded-[9px] text-[13px] font-medium transition-colors', value.includes(w.value) ? 'bg-tint text-white' : 'bg-fill text-label hover:bg-fill-strong')}
        >
          {w.label}
        </button>
      ))}
    </div>
  )
}

function RoutineEditor({ routine, unit, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => ({
    name: routine?.name || '',
    days: routine?.days || [],
    focus: routine?.focus || '',
    exercises: toExerciseForm(routine?.exercises).concat(routine ? [] : [blankExercise()]),
    notes: routine?.notes || '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (key) => (value) => setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...(routine ? { id: routine.id } : {}),
        name: form.name.trim(),
        days: form.days,
        focus: form.focus.trim() || null,
        exercises: fromExerciseForm(form.exercises),
        notes: form.notes.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.code === '23505' ? 'You already have a routine with this name.' : err.message || 'Could not save this routine.')
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={routine ? 'Edit Routine' : 'New Routine'} confirmLabel={saving ? 'Saving…' : 'Save'} onConfirm={save} confirmDisabled={saving || !form.name.trim()}>
      <ErrorBanner message={error} />
      <FormGroup>
        <TextInput value={form.name} onChange={set('name')} placeholder="Name, e.g. Push day" autoFocus={!routine} />
        <TextInput label="Focus" value={form.focus} onChange={set('focus')} placeholder="Chest, shoulders, triceps" />
      </FormGroup>
      <FormGroup title="Done on" footer="Shows up as today’s plan on these days.">
        <DayPicker value={form.days} onChange={set('days')} />
      </FormGroup>
      <ExercisesEditor value={form.exercises} onChange={set('exercises')} unit={unit} footer="Reps can be a range, like 8-12." />
      <FormGroup title="Notes">
        <TextArea value={form.notes} onChange={set('notes')} rows={2} placeholder="Warm-up, rest times, progression…" />
      </FormGroup>
      {routine && (
        <>
          <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /> Delete Routine</Button>
          <ActionSheet
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Delete “${routine.name}”?`}
            message="Workouts you logged with it stay."
            actions={[{ label: 'Delete Routine', destructive: true, onClick: () => { onDelete(routine); onClose() } }]}
          />
        </>
      )}
    </Sheet>
  )
}

const UNITS = [{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]

function GoalsEditor({ goals, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    days_per_week: numberText(goals?.days_per_week),
    gym_days: goals?.gym_days || [],
    session_minutes: numberText(goals?.session_minutes),
    weight_unit: goals?.weight_unit || 'kg',
    target_weight: numberText(goals?.target_weight),
    focus: goals?.focus || '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (value) => setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const perWeek = toInt(form.days_per_week)
      await onSave({
        days_per_week: perWeek ? Math.min(perWeek, 7) : (form.gym_days.length || null),
        gym_days: form.gym_days,
        session_minutes: toInt(form.session_minutes) || null,
        weight_unit: form.weight_unit,
        target_weight: toNumber(form.target_weight) || null,
        focus: form.focus.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save your goals.')
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Training Goals" confirmLabel={saving ? 'Saving…' : 'Save'} onConfirm={save} confirmDisabled={saving}>
      <ErrorBanner message={error} />
      <FormGroup title="Gym days" footer="Planned days that pass with nothing logged show a cross. Your AI agents can change these too.">
        <DayPicker value={form.gym_days} onChange={value => setForm(prev => ({ ...prev, gym_days: value, days_per_week: prev.days_per_week || '' }))} />
        <TextInput label="Per week" value={form.days_per_week} onChange={set('days_per_week')} type="number" inputMode="numeric" placeholder={form.gym_days.length ? String(form.gym_days.length) : 'e.g. 4'} />
        <TextInput label="Minutes" value={form.session_minutes} onChange={set('session_minutes')} type="number" inputMode="numeric" placeholder="per session" />
      </FormGroup>
      <FormGroup title="Body">
        <div className="px-3 py-2"><Segmented options={UNITS} value={form.weight_unit} onChange={set('weight_unit')} /></div>
        <TextInput label="Target" value={form.target_weight} onChange={set('target_weight')} type="number" inputMode="decimal" placeholder={`weight in ${form.weight_unit}`} />
      </FormGroup>
      <FormGroup title="What you’re training for" footer="Agents read this when they plan your workouts and meals.">
        <TextArea value={form.focus} onChange={set('focus')} rows={3} placeholder="e.g. Lose fat and keep muscle. Bench 225 lb by summer. Bad left knee: no deep squats." />
      </FormGroup>
      {goals?.updated_by && goals.updated_at && (
        <p className="px-4 text-[13px] text-label-2">
          {`Last changed by ${goals.updated_by} on ${new Date(goals.updated_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}.`}
        </p>
      )}
    </Sheet>
  )
}

function BodyEditor({ entry, unit, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => ({
    measured_on: entry?.measured_on || today(),
    weight: numberText(entry?.weight),
    body_fat: numberText(entry?.body_fat),
    notes: entry?.notes || '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (value) => setForm(prev => ({ ...prev, [key]: value }))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...(entry ? { id: entry.id } : {}),
        measured_on: form.measured_on,
        weight: toNumber(form.weight) || null,
        body_fat: toNumber(form.body_fat) || null,
        notes: form.notes.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save this weigh-in.')
      setSaving(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title={entry ? 'Edit Weigh-in' : 'Weigh In'} confirmLabel={saving ? 'Saving…' : 'Save'} onConfirm={save} confirmDisabled={saving || !(toNumber(form.weight) || toNumber(form.body_fat))}>
      <ErrorBanner message={error} />
      <FormGroup footer="One weigh-in per day: saving again that day updates it.">
        <TextInput label="Date" type="date" value={form.measured_on} onChange={value => value && set('measured_on')(value)} />
        <TextInput label="Weight" value={form.weight} onChange={set('weight')} type="number" inputMode="decimal" placeholder={unit} autoFocus={!entry} />
        <TextInput label="Body fat" value={form.body_fat} onChange={set('body_fat')} type="number" inputMode="decimal" placeholder="% (optional)" />
      </FormGroup>
      <FormGroup title="Notes">
        <TextArea value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional" />
      </FormGroup>
      {entry && <Button variant="danger" className="w-full" onClick={() => { onDelete(entry); onClose() }}><Trash2 size={18} /> Delete Weigh-in</Button>}
    </Sheet>
  )
}

/** Everything logged on one day, with quick ways to add to it. */
function DaySheet({ day, calendar, onClose, onLog, onEdit }) {
  const logged = calendar.byDay.get(day) || []
  const status = calendar.statusOf(day)
  return (
    <Sheet open onClose={onClose} title={dayLabel(day)}>
      <div className="mb-5 flex items-center gap-3 px-1">
        <DayMark status={status} size={36}>{parseDay(day).getDate()}</DayMark>
        <p className="text-[17px] text-label">{status ? STATUS_WORDS[status].replace(/^./, c => c.toUpperCase()) : 'Nothing logged'}</p>
      </div>
      {logged.length > 0 && (
        <Section>
          {logged.map(w => (
            <Row key={w.id} onClick={() => onEdit(w)} title={w.title || STATUSES.find(s => s.value === w.status)?.label} subtitle={workoutSubtitle(w) || STATUSES.find(s => s.value === w.status)?.label} chevron />
          ))}
        </Section>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Button size="md" variant="green" onClick={() => onLog({ day, status: 'done' })}><Check size={16} strokeWidth={3} /> Workout</Button>
        <Button size="md" variant="danger" onClick={() => onLog({ day, status: 'skipped' })}><X size={16} strokeWidth={3} /> Skipped</Button>
        <Button size="md" variant="gray" onClick={() => onLog({ day, status: 'rest' })}><Moon size={15} /> Rest</Button>
      </div>
    </Sheet>
  )
}

// ---------- tab ----------

export default function FitnessTab({ showUndo }) {
  const [month, setMonth] = useState(() => monthStart(today()))
  const fitness = useFitness(month)
  const [editing, setEditing] = useState(null) // { workout } or { defaults }
  const [routineEditing, setRoutineEditing] = useState(null) // { routine }
  const [bodyEditing, setBodyEditing] = useState(null) // { entry }
  const [goalsOpen, setGoalsOpen] = useState(false)
  const [openDay, setOpenDay] = useState(null)

  const { goals, routines, workouts, body, firstDone } = fitness
  const unit = goals?.weight_unit || 'kg'
  const calendar = useMemo(() => buildCalendar(workouts, goals, firstDone), [workouts, goals, firstDone])

  const stats = useMemo(() => {
    const now = today()
    const doneDays = [...new Set(workouts.filter(w => w.status === 'done' && w.done_on <= now).map(w => w.done_on))].sort()
    const last = doneDays[doneDays.length - 1]
    const last30 = doneDays.filter(d => d > addDays(now, -30)).length
    let streak = null
    const goal = goals?.days_per_week
    if (goal) {
      const monday = mondayOf(now)
      streak = calendar.weekCount(monday) >= goal ? 1 : 0
      for (let week = addDays(monday, -7); calendar.weekCount(week) >= goal && streak < 26; week = addDays(week, -7)) streak += 1
    }
    const daysSince = last ? Math.round((parseDay(now) - parseDay(last)) / 86400000) : null
    return { last30, streak, daysSince }
  }, [workouts, goals, calendar])

  const recent = useMemo(() => [...workouts].filter(w => w.status === 'done').reverse().slice(0, 6), [workouts])

  const removeWorkout = async (workout) => {
    try {
      await fitness.removeWorkout(workout)
      const { id: _id, ...rest } = workout
      showUndo({ message: `Deleted “${workout.title || 'workout'}”`, undo: () => fitness.restoreWorkout(rest).catch(() => {}) })
    } catch {
      // The error banner explains it.
    }
  }

  const removeRoutine = async (routine) => {
    try {
      await fitness.deleteRoutine(routine)
      const { id: _id, updated_by: _by, ...rest } = routine
      showUndo({ message: `Deleted “${routine.name}”`, undo: () => fitness.saveRoutine(rest).catch(() => {}) })
    } catch {
      // The error banner explains it.
    }
  }

  const removeBody = async (entry) => {
    try {
      await fitness.deleteBody(entry)
    } catch {
      // The error banner explains it.
    }
  }

  const quickLog = async ({ status, routine, day = today() }) => {
    // A tick for a planned routine logs it in one tap; everything else opens the editor to fill in.
    if (status !== 'done' || routine) {
      try {
        await fitness.saveWorkout({
          done_on: day,
          status,
          title: routine ? routine.name : status === 'skipped' ? 'Skipped' : status === 'rest' ? 'Rest day' : 'Workout',
          routine_id: routine?.id || null,
          kind: routine ? 'strength' : null,
          exercises: routine?.exercises || [],
        })
      } catch {
        // The error banner explains it.
      }
      return
    }
    setEditing({ defaults: { day, status } })
  }

  const subtitle = goals?.days_per_week
    ? `${calendar.weekCount(mondayOf(today()))} of ${goals.days_per_week} gym days this week`
    : 'Gym days, workouts and your plan'

  if (fitness.missing) {
    return (
      <div>
        <PageHeader title="Fitness" />
        <EmptyState icon={Dumbbell} title="Almost ready" message="Run supabase/migrations/*_fitness.sql in the Supabase SQL editor to turn on workout tracking." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Fitness" subtitle={subtitle}>
        <button type="button" onClick={() => setGoalsOpen(true)} aria-label="Training goals" title="Training goals" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-tint shadow-card transition-transform active:scale-95">
          <Target size={18} />
        </button>
        <AddButton onClick={() => setEditing({ defaults: { day: today(), status: 'done' } })} label="Log Workout" />
      </PageHeader>

      <ErrorBanner message={fitness.error} onDismiss={fitness.clearError} />

      {fitness.loading ? (
        <div className="h-64 animate-pulse rounded-[16px] bg-surface" />
      ) : (
        <>
          <WeekCard calendar={calendar} goals={goals} stats={stats} onSetGoals={() => setGoalsOpen(true)} onOpenDay={setOpenDay} />

          <TodayCard calendar={calendar} goals={goals} routines={routines} onLog={quickLog} onEdit={workout => setEditing({ workout })} />

          <MonthCalendar month={month} onMonth={setMonth} calendar={calendar} onOpenDay={setOpenDay} />

          <Section
            title="Workout plan"
            trailing={(
              <button type="button" onClick={() => setRoutineEditing({ routine: null })} className="flex items-center gap-0.5 text-[15px] text-tint hover:opacity-70">
                <Plus size={15} strokeWidth={2.4} /> Routine
              </button>
            )}
            footer={goals?.focus ? `Training for: ${goals.focus}` : 'The exercises you should be doing, and on which days. Ask your AI agent to build one for you.'}
          >
            {routines.length ? routines.map(r => (
              <Row
                key={r.id}
                onClick={() => setRoutineEditing({ routine: r })}
                title={r.name}
                subtitle={[(r.days || []).length ? formatDays(r.days) : 'Any day', r.focus, pluralize((r.exercises || []).length, 'exercise'), r.updated_by !== 'App' ? `by ${r.updated_by}` : null].filter(Boolean).join(' · ')}
                chevron
              />
            )) : (
              <p className="px-4 py-3 text-[15px] text-label-3">No routines yet</p>
            )}
          </Section>

          {recent.length > 0 && (
            <Section title="Recent workouts">
              {recent.map(w => (
                <Row
                  key={w.id}
                  onClick={() => setEditing({ workout: w })}
                  title={w.title || 'Workout'}
                  subtitle={workoutSubtitle(w) || undefined}
                  trailing={<span className="text-[15px] text-label-2">{dayLabel(w.done_on)}</span>}
                />
              ))}
            </Section>
          )}

          <BodySection body={body} goals={goals} onLog={() => setBodyEditing({ entry: null })} onEdit={entry => setBodyEditing({ entry })} />

          <p className="flex items-start gap-2 px-1 pb-4 text-[13px] text-label-2">
            <Scale size={15} className="mt-px shrink-0 text-tint" />
            Ask your AI agent: “I did legs today, squats 5×5 at 185”, “plan a 4-day split for me”, “what should I eat before the gym?”. It sees your food log and pantry too.
          </p>
        </>
      )}

      {openDay && (
        <DaySheet
          day={openDay}
          calendar={calendar}
          onClose={() => setOpenDay(null)}
          onLog={async (args) => {
            setOpenDay(null)
            await quickLog(args)
          }}
          onEdit={workout => { setOpenDay(null); setEditing({ workout }) }}
        />
      )}
      {editing && (
        <WorkoutEditor
          workout={editing.workout}
          defaults={editing.defaults}
          routines={routines}
          unit={unit}
          onClose={() => setEditing(null)}
          onSave={fitness.saveWorkout}
          onDelete={removeWorkout}
        />
      )}
      {routineEditing && (
        <RoutineEditor routine={routineEditing.routine} unit={unit} onClose={() => setRoutineEditing(null)} onSave={fitness.saveRoutine} onDelete={removeRoutine} />
      )}
      {bodyEditing && (
        <BodyEditor entry={bodyEditing.entry} unit={unit} onClose={() => setBodyEditing(null)} onSave={fitness.saveBody} onDelete={removeBody} />
      )}
      {goalsOpen && <GoalsEditor goals={goals} onClose={() => setGoalsOpen(false)} onSave={fitness.saveGoals} />}
    </div>
  )
}
