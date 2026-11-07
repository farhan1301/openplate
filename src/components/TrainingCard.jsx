import { useMemo } from 'react'
import { Check, ChevronRight, Dumbbell, Moon, X } from 'lucide-react'
import { cx } from '../lib/cx'
import { today, addDays } from '../lib/nutrition'
import { buildCalendar, mondayOf, useFitness, weekdayOf, WEEKDAYS } from '../lib/fitness'

const MARKS = {
  done: <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green text-white"><Check size={12} strokeWidth={3.4} /></span>,
  missed: <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red/14 text-red"><X size={12} strokeWidth={3.4} /></span>,
  rest: <span className="flex h-5 w-5 items-center justify-center rounded-full bg-fill text-label-2"><Moon size={10} strokeWidth={2.6} /></span>,
  planned: <span className="h-5 w-5 rounded-full border-[1.5px] border-dashed border-tint" />,
}

/** Home's one-glance training line: this week's ticks and crosses, and what's planned today. */
export default function TrainingCard({ onOpen }) {
  const { goals, routines, workouts, firstDone, loading, missing } = useFitness()
  const calendar = useMemo(() => buildCalendar(workouts, goals, firstDone), [workouts, goals, firstDone])
  if (loading || missing) return null

  const day = today()
  const monday = mondayOf(day)
  const done = calendar.weekCount(monday)
  const goal = goals?.days_per_week
  const status = calendar.statusOf(day)
  const planned = routines.filter(r => (r.days || []).includes(weekdayOf(day)))
  const todayLine = status === 'done'
    ? `Done today: ${(calendar.byDay.get(day) || []).find(w => w.status === 'done')?.title || 'workout'}`
    : status === 'rest' ? 'Rest day today'
      : status === 'missed' ? 'Skipped today'
        : planned.length ? `Today: ${planned.map(r => r.name).join(' + ')}`
          : status === 'planned' ? 'Gym day today' : 'Nothing planned today'

  if (!goal && !workouts.length && !routines.length) return null

  return (
    <button type="button" onClick={onOpen} className="mb-9 flex w-full items-center gap-3 rounded-[16px] bg-surface p-4 text-left shadow-card transition-transform active:scale-[0.99]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint/14 text-tint"><Dumbbell size={20} strokeWidth={2.2} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold text-label">{goal ? `${done} of ${goal} gym days this week` : `${done} gym ${done === 1 ? 'day' : 'days'} this week`}</span>
        <span className="block truncate text-[13px] text-label-2">{todayLine}</span>
        <span className="mt-2 flex gap-1.5" aria-hidden="true">
          {WEEKDAYS.map((w, i) => {
            const d = addDays(monday, i)
            const mark = MARKS[calendar.statusOf(d)]
            return (
              <span key={w.value} className="flex flex-col items-center gap-0.5">
                {mark || <span className="h-5 w-5 rounded-full bg-fill" />}
                <span className={cx('text-[10px]', d === day ? 'font-semibold text-tint' : 'text-label-3')}>{w.narrow}</span>
              </span>
            )
          })}
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-label-3" />
    </button>
  )
}
