import { useState } from 'react'
import { Clock, Flame, Heart, Pencil, ShoppingBag, Trash2 } from 'lucide-react'
import { mealReadiness, pluralize, STATUS_META } from '../lib/kitchen'
import { ActionSheet, Button, CheckCircle, Pill, Row, Section, Sheet } from './ui'
import { cx } from '../lib/cx'
import { FoodImage } from './FoodImage'
import { deleteFoodEntry, formatAmount, hasNutrition, logFood, scaleNutrition, SLOTS, slotForNow, today } from '../lib/nutrition'

export default function MealDetail({ kitchen, meal, onClose, onEdit, onDelete, onEditFavorite, showUndo }) {
  const { inStock, onList, ingredientsById, mealCategories, favorites } = kitchen
  const readiness = mealReadiness(meal, inStock, onList)
  const [includeOptional, setIncludeOptional] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [logged, setLogged] = useState('')

  const logMeal = async () => {
    const slot = slotForNow()
    try {
      const entry = await logFood({ eaten_on: today(), slot, name: meal.name, meal_id: meal.id, servings: 1, ...scaleNutrition(meal, 1) })
      const where = SLOTS.find(s => s.value === slot).label.toLowerCase()
      setLogged(`Logged 1 serving to today’s ${where}.`)
      showUndo?.({ message: `Logged “${meal.name}”`, undo: () => { deleteFoodEntry(entry.id).catch(() => {}); setLogged('') } })
    } catch (err) {
      setLogged(err.message || 'Could not log this meal.')
    }
  }
  const favorite = favorites.find(f => f.meal_id === meal.id)
  const isFavorite = Boolean(favorite)
  const category = mealCategories.find(c => c.id === meal.meal_category_id)

  const toBuy = [...readiness.toBuy, ...(includeOptional ? readiness.toBuyOptional : [])]
  const links = [...meal.meal_ingredients].sort((a, b) => Number(a.optional) - Number(b.optional))
  const meta = STATUS_META[readiness.status]

  return (
    <Sheet open onClose={onClose} title="">
      <FoodImage
        src={meal.image_url}
        name={meal.name}
        hint={{ category: category?.name }}
        className="mb-4 aspect-[16/9] w-full rounded-[14px]"
        emojiClassName="text-[64px]"
      />
      <div className="mb-5 px-1">
        <h2 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-label">{meal.name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pill color={meta.color}>{meta.label}</Pill>
          {category && <Pill>{category.name}</Pill>}
          {meal.prep_time_minutes && <Pill><Clock size={12} strokeWidth={2.4} /> {meal.prep_time_minutes} min</Pill>}
        </div>
        {hasNutrition(meal) && (
          <p className="mt-3 text-[15px] tabular-nums text-label">
            <span className="font-semibold">{formatAmount(meal.calories, 'calories')} kcal</span>
            <span className="text-label-2">{` per serving · P ${formatAmount(meal.protein)} · C ${formatAmount(meal.carbs)} · F ${formatAmount(meal.fat)} · Fiber ${formatAmount(meal.fiber)} g`}</span>
          </p>
        )}
        {meal.description && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-label-2">{meal.description}</p>}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-2">
        <button type="button" onClick={() => kitchen.toggleMealFavorite(meal)} className="flex flex-col items-center gap-1 rounded-[12px] bg-surface py-3 text-[13px] font-medium text-label transition-colors hover:bg-fill dark:bg-elevated">
          <Heart size={20} className={isFavorite ? 'fill-pink text-pink' : 'text-tint'} />
          {isFavorite ? 'Favorited' : 'Favorite'}
        </button>
        <button type="button" onClick={onEdit} className="flex flex-col items-center gap-1 rounded-[12px] bg-surface py-3 text-[13px] font-medium text-label transition-colors hover:bg-fill dark:bg-elevated">
          <Pencil size={20} className="text-tint" /> Edit
        </button>
        <button type="button" onClick={() => setConfirmDelete(true)} className="flex flex-col items-center gap-1 rounded-[12px] bg-surface py-3 text-[13px] font-medium text-red transition-colors hover:bg-fill dark:bg-elevated">
          <Trash2 size={20} /> Delete
        </button>
      </div>

      {hasNutrition(meal) && (
        <div className="-mt-3 mb-6">
          <Button variant="tinted" className="w-full" onClick={logMeal}><Flame size={18} /> Log a serving as eaten</Button>
          {logged && <p className="pt-1.5 text-center text-[13px] text-label-2">{logged}</p>}
        </div>
      )}

      {favorite && onEditFavorite && (
        <Section>
          <Row
            onClick={() => onEditFavorite(favorite)}
            leading={<Heart size={20} className="fill-pink text-pink" />}
            title="Favorite details"
            subtitle={[favorite.cuisine, favorite.rating && '★'.repeat(favorite.rating), favorite.notes].filter(Boolean).join(' · ') || 'Add cuisine, rating and notes'}
            chevron
          />
        </Section>
      )}

      {links.length > 0 && (
        <Section
          title={`Ingredients · ${readiness.have}/${readiness.total} essentials`}
          footer="Tap the circle to mark something as in stock or out."
        >
          {links.map(link => {
            const ingredient = ingredientsById.get(link.ingredient_id)
            if (!ingredient) return null
            const have = inStock.has(link.ingredient_id)
            const listed = onList.has(link.ingredient_id)
            return (
              <Row
                key={link.id}
                leading={<CheckCircle checked={have} onClick={() => kitchen.setStock([ingredient.id], !have)} label={`${ingredient.name} in stock`} />}
                title={ingredient.name}
                titleClassName={cx(!have && link.optional && 'text-label-2')}
                subtitle={[link.optional && 'Optional', link.quantity, have ? 'In stock' : listed ? 'On grocery list' : 'Not at home'].filter(Boolean).join(' · ')}
                trailing={!have && (listed
                  ? <Pill color="tint">On list</Pill>
                  : <Button size="sm" variant="tinted" onClick={() => kitchen.addToList([ingredient.id], meal.id)}>Add</Button>)}
              />
            )
          })}
        </Section>
      )}

      {readiness.status === 'ready' ? (
        <p className="rounded-[12px] bg-green/12 px-4 py-3.5 text-center text-[15px] font-medium text-green">You have everything you need. Enjoy!</p>
      ) : toBuy.length > 0 ? (
        <div className="space-y-2">
          <Button className="w-full" onClick={() => kitchen.addToList(toBuy.map(link => link.ingredient_id), meal.id)}>
            <ShoppingBag size={18} /> Add {pluralize(toBuy.length, 'item')} to Grocery List
          </Button>
          {readiness.toBuyOptional.length > 0 && (
            <button type="button" onClick={() => setIncludeOptional(v => !v)} className="w-full py-2 text-[15px] text-tint">
              {includeOptional ? 'Essentials only' : `Also include ${pluralize(readiness.toBuyOptional.length, 'optional item')}`}
            </button>
          )}
        </div>
      ) : readiness.status !== 'empty' && (
        <p className="rounded-[12px] bg-tint/12 px-4 py-3.5 text-center text-[15px] font-medium text-tint">Everything you need is on your grocery list.</p>
      )}

      <ActionSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete “${meal.name}”?`}
        message="Its ingredients stay in your pantry."
        actions={[{ label: 'Delete Meal', destructive: true, onClick: onDelete }]}
      />
    </Sheet>
  )
}
