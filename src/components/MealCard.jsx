import { Heart, ShoppingBag } from 'lucide-react'
import { FoodImage } from './FoodImage'
import { cx } from '../lib/cx'

const DOTS = { ready: 'bg-green', listed: 'bg-tint', almost: 'bg-orange', missing: 'bg-red', empty: 'bg-white/60' }

function statusLabel(readiness) {
  const missing = readiness.total - readiness.have
  switch (readiness.status) {
    case 'ready': return 'Ready'
    case 'listed': return 'On list'
    case 'empty': return 'No ingredients'
    default: return `Need ${missing}`
  }
}

function subtitle(meal, readiness, ingredientsById, categoryName) {
  const names = (links) => links.map(link => ingredientsById.get(link.ingredient_id)?.name).filter(Boolean).join(', ')
  switch (readiness.status) {
    case 'almost': return `Need ${names(readiness.missingEssential)}`
    case 'listed': return 'Waiting on groceries'
    case 'missing': return `Have ${readiness.have} of ${readiness.total}`
    default: return [categoryName, meal.prep_time_minutes && `${meal.prep_time_minutes} min`].filter(Boolean).join(' · ')
  }
}

/** Photo card for one meal: what it looks like, whether you can cook it, and what's missing. */
export default function MealCard({ meal, readiness, favorite, categoryName, ingredientsById, onOpen, onShop, className }) {
  const toBuy = readiness.toBuy.length
  const text = subtitle(meal, readiness, ingredientsById, categoryName)
  return (
    <div className={cx('group relative flex flex-col overflow-hidden rounded-[16px] bg-surface shadow-card transition-transform active:scale-[0.98]', className)}>
      <button type="button" onClick={onOpen} aria-label={meal.name} className="absolute inset-0 z-[1] rounded-[16px]" />
      <div className="relative">
        <FoodImage
          src={meal.image_url}
          name={meal.name}
          hint={{ category: categoryName }}
          className="aspect-[4/3] w-full transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute left-2 top-2 inline-flex h-6 items-center gap-1.5 rounded-full bg-black/55 px-2 text-[11px] font-semibold text-white backdrop-blur-md">
          <span className={cx('h-1.5 w-1.5 rounded-full', DOTS[readiness.status])} />
          {statusLabel(readiness)}
        </span>
        {favorite && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 backdrop-blur-md">
            <Heart size={13} className="fill-pink text-pink" />
          </span>
        )}
      </div>
      <div className="flex flex-1 items-end gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-label">{meal.name}</p>
          {text && <p className={cx('mt-0.5 truncate text-[12px]', readiness.status === 'almost' ? 'text-orange' : 'text-label-2')}>{text}</p>}
        </div>
        {onShop && toBuy > 0 && (
          <button
            type="button"
            onClick={() => onShop(readiness.toBuy.map(link => link.ingredient_id), meal.id)}
            aria-label={`Add ${toBuy} missing to grocery list`}
            title="Add what’s missing to the grocery list"
            className="relative z-[2] flex h-7 shrink-0 items-center gap-1 rounded-full bg-tint/12 px-2.5 text-[12px] font-semibold text-tint transition-transform active:scale-95"
          >
            <ShoppingBag size={12} strokeWidth={2.4} /> {toBuy}
          </button>
        )}
      </div>
    </div>
  )
}
