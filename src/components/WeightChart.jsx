import { useMemo } from 'react'
import { addDays, parseDay, today } from '../lib/nutrition'

const DAY_MS = 86400000
const WINDOW_DAYS = 90 // weigh-ins shown on the chart
const FIT_DAYS = 28 // weigh-ins the trend line is fitted to
const MAX_PROJECT_DAYS = 730 // don't promise a date further out than two years

const dayNumber = (day) => Math.round(parseDay(day).getTime() / DAY_MS)
const round1 = (n) => Math.round(n * 10) / 10
const shortDate = (day) => parseDay(day).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
const longDate = (day) => parseDay(day).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })

/** Least-squares line through the points ({ x: day number, y: weight }); null if it can't be fitted. */
function fitLine(points) {
  if (points.length < 2) return null
  const n = points.length
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  const sxx = points.reduce((s, p) => s + (p.x - mx) ** 2, 0)
  if (sxx === 0) return null
  const slope = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx
  return { slope, at: (x) => my + slope * (x - mx) }
}

/** The recent trend and, when it is heading toward the target, the day it should be reached. */
function weightTrend(body, target) {
  const weighIns = body.filter(b => b.weight != null).map(b => ({ day: b.measured_on, x: dayNumber(b.measured_on), y: Number(b.weight) }))
  if (!weighIns.length) return null
  const last = weighIns[weighIns.length - 1]
  const recent = weighIns.filter(p => p.x >= last.x - FIT_DAYS)
  const spanDays = recent.length ? recent[recent.length - 1].x - recent[0].x : 0
  const line = recent.length >= 2 && spanDays >= 3 ? fitLine(recent) : null
  if (!line) return { weighIns, last, line: null, perWeek: null, reachOn: null, status: 'need-data' }

  const perWeek = round1(line.slope * 7)
  const current = line.at(last.x)
  let reachOn = null
  let status = 'no-target'
  if (target) {
    const needed = target - current
    if (Math.abs(needed) < 0.05) status = 'reached'
    else if (line.slope === 0 || Math.sign(line.slope) !== Math.sign(needed)) status = 'wrong-way'
    else {
      const days = needed / line.slope
      if (days > MAX_PROJECT_DAYS) status = 'too-far'
      else { reachOn = addDays(today(), Math.max(0, Math.ceil(last.x + days - dayNumber(today())))); status = 'on-track' }
    }
  }
  return { weighIns, last, line, perWeek, reachOn, status }
}

function weightTrendSentence(trend, target, unit) {
  if (!trend) return null
  switch (trend.status) {
    case 'need-data': return 'Log a few more weigh-ins over several days to see your trend.'
    case 'no-target': return 'Set a target weight in Goals to see when you’ll reach it.'
    case 'reached': return 'You’re at your target weight.'
    case 'wrong-way': return `Trending ${trend.perWeek > 0 ? 'up' : 'down'} ${Math.abs(trend.perWeek)} ${unit}/week, away from ${target} ${unit}.`
    case 'too-far': return `Trend is ${Math.abs(trend.perWeek)} ${unit}/week, so ${target} ${unit} is over two years away.`
    default: return `At ${Math.abs(trend.perWeek)} ${unit}/week you’d reach ${target} ${unit} around ${longDate(trend.reachOn)}.`
  }
}

/** Weigh-ins, the recent trend, and a dotted projection to the target weight. */
export default function WeightChart({ body, target, unit }) {
  const trend = useMemo(() => weightTrend(body, target), [body, target])
  if (!trend || trend.weighIns.length < 2) return null

  const now = dayNumber(today())
  const points = trend.weighIns.filter(p => p.x >= now - WINDOW_DAYS)
  if (points.length < 2) return null

  const { line, reachOn } = trend
  const startX = points[0].x
  const lastX = trend.last.x
  const endX = Math.max(now, reachOn ? dayNumber(reachOn) : lastX)
  const fitStart = Math.max(startX, lastX - FIT_DAYS)
  const reachX = reachOn ? dayNumber(reachOn) : null

  const ys = points.map(p => p.y)
  if (target) ys.push(target)
  if (line) { ys.push(line.at(fitStart), line.at(reachX ?? lastX)) }
  const rawMin = Math.min(...ys)
  const rawMax = Math.max(...ys)
  const pad = Math.max((rawMax - rawMin) * 0.12, 0.5)
  const minY = rawMin - pad
  const maxY = rawMax + pad

  const W = 340
  const H = 170
  const m = { l: 34, r: 10, t: 10, b: 22 }
  const sx = (x) => m.l + ((x - startX) / Math.max(endX - startX, 1)) * (W - m.l - m.r)
  const sy = (y) => m.t + ((maxY - y) / (maxY - minY)) * (H - m.t - m.b)
  const pt = (x, y) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`

  const ticks = [minY + pad, (minY + maxY) / 2, maxY - pad].map(round1)
  const label = weightTrendSentence(trend, target, unit)

  return (
    <div className="border-b border-separator px-4 py-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Weight trend. ${label || ''}`}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} className="stroke-separator" strokeWidth="1" />
            <text x={m.l - 5} y={sy(t) + 3.5} textAnchor="end" className="fill-label-3" fontSize="10">{t}</text>
          </g>
        ))}
        {target ? (
          <g>
            <line x1={m.l} x2={W - m.r} y1={sy(target)} y2={sy(target)} className="stroke-green" strokeWidth="1.5" strokeDasharray="5 4" />
            <text x={W - m.r} y={sy(target) - 4} textAnchor="end" className="fill-green" fontSize="10">{`Target ${target}`}</text>
          </g>
        ) : null}
        {line ? (
          <>
            <line x1={sx(fitStart)} y1={sy(line.at(fitStart))} x2={sx(lastX)} y2={sy(line.at(lastX))} className="stroke-tint" strokeWidth="2" strokeLinecap="round" />
            {reachX != null && reachX > lastX && (
              <line x1={sx(lastX)} y1={sy(line.at(lastX))} x2={sx(reachX)} y2={sy(target)} className="stroke-tint" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 5" />
            )}
          </>
        ) : null}
        <polyline points={points.map(p => pt(p.x, p.y)).join(' ')} fill="none" className="stroke-label-3" strokeWidth="1" />
        {points.map(p => <circle key={p.day} cx={sx(p.x)} cy={sy(p.y)} r="2.8" className="fill-label" />)}
        {reachX != null && <circle cx={sx(reachX)} cy={sy(target)} r="4" className="fill-surface stroke-tint" strokeWidth="2" />}
        <text x={m.l} y={H - 5} fontSize="10" className="fill-label-3">{shortDate(points[0].day)}</text>
        <text x={W - m.r} y={H - 5} textAnchor="end" fontSize="10" className="fill-label-3">{shortDate(addDays(today(), endX - now))}</text>
      </svg>
      {label && <p className="mt-1 text-[13px] text-label-2">{label}</p>}
    </div>
  )
}
