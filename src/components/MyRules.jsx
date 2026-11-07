import { useState } from 'react'
import { CandyOff, Check, ChevronDown, House, Leaf, Quote } from 'lucide-react'
import { QUOTES, RULES } from '../lib/principles'
import { cx } from '../lib/cx'

const ICONS = { house: House, 'candy-off': CandyOff, leaf: Leaf }
const TONES = {
  green: 'text-green bg-green/14',
  pink: 'text-pink bg-pink/14',
  teal: 'text-teal bg-teal/14',
}

// A different quote each day; tapping the card moves to the next one.
function dayIndex() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now - start) / 86400000)
}

function QuoteCard() {
  const [index, setIndex] = useState(() => dayIndex() % QUOTES.length)
  const quote = QUOTES[index]
  return (
    <button
      type="button"
      onClick={() => setIndex(i => (i + 1) % QUOTES.length)}
      aria-label="Next quote"
      className="mb-3 block w-full rounded-[16px] bg-gradient-to-br from-indigo to-tint p-4 text-left text-white shadow-card transition-transform active:scale-[0.99]"
    >
      <Quote size={18} className="mb-1.5 opacity-70" />
      <p className="text-[17px] font-semibold leading-snug">{quote.text}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[13px] opacity-80">{quote.by}</p>
        <p className="text-[12px] tabular-nums opacity-60">{index + 1}/{QUOTES.length} · tap for next</p>
      </div>
    </button>
  )
}

function RuleRow({ rule, open, onToggle }) {
  const Icon = ICONS[rule.icon]
  return (
    <div className="border-b border-separator last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fill/40"
      >
        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', TONES[rule.tone])}>
          <Icon size={16} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold leading-tight text-label">{rule.title}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-label-2">{rule.summary}</span>
        </span>
        <ChevronDown size={18} className={cx('shrink-0 text-label-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 pb-4 pl-[60px]">
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-label-2">Why</p>
          <ul className="space-y-2">
            {rule.why.map(([lead, text]) => (
              <li key={lead} className="text-[14px] leading-snug text-label">
                <span className="font-semibold">{lead}</span> <span className="text-label-2">{text}</span>
              </li>
            ))}
          </ul>

          {rule.exceptions && (
            <div className="mt-4 rounded-[12px] bg-fill/60 p-3">
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-label-2">{rule.exceptionsTitle}</p>
              <ul className="space-y-1">
                {rule.exceptions.map(item => (
                  <li key={item} className="flex items-start gap-2 text-[14px] leading-snug text-label">
                    <Check size={15} strokeWidth={2.6} className="mt-0.5 shrink-0 text-green" />
                    {item}
                  </li>
                ))}
              </ul>
              {rule.exceptionsNote && <p className="mt-2.5 text-[13px] leading-snug text-label-2">{rule.exceptionsNote}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MyRules() {
  const [openId, setOpenId] = useState(null)
  if (!RULES.length) return null
  return (
    <section className="mb-8">
      <div className="mb-3 px-1">
        <h2 className="text-[22px] font-bold tracking-[-0.01em] text-label">My rules</h2>
        <p className="text-[13px] text-label-2">Tap a rule to remember why</p>
      </div>
      <QuoteCard />
      <div className="overflow-hidden rounded-[16px] bg-surface shadow-card">
        {RULES.map(rule => (
          <RuleRow
            key={rule.id}
            rule={rule}
            open={openId === rule.id}
            onToggle={() => setOpenId(id => (id === rule.id ? null : rule.id))}
          />
        ))}
      </div>
    </section>
  )
}
