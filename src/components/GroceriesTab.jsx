import { useMemo, useState } from 'react'
import { Plus, ShoppingBag, X } from 'lucide-react'
import { normalizedName, pluralize } from '../lib/kitchen'
import { ActionSheet, Button, CheckCircle, EmptyState, PageHeader, Row, Section, TextButton, TokenPicker } from './ui'
import { cx } from '../lib/cx'

function QuickAdd({ kitchen }) {
  const { ingredients, ingredientCategories, onList } = kitchen
  const otherCategory = ingredientCategories.find(c => c.name === 'Other') || ingredientCategories[0]
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [busy, setBusy] = useState(false)

  const q = normalizedName(name)
  const exact = ingredients.find(i => normalizedName(i.name) === q)
  const suggestions = q
    ? ingredients
      .filter(i => normalizedName(i.name).includes(q) && !onList.has(i.id) && i !== exact)
      .sort((a, b) => Number(normalizedName(b.name).startsWith(q)) - Number(normalizedName(a.name).startsWith(q)))
      .slice(0, 4)
    : []

  const reset = () => {
    setName('')
    setCategoryId('')
  }

  const addExisting = async (ingredient) => {
    reset()
    await kitchen.addToList([ingredient.id])
  }

  const submit = async () => {
    if (!q || busy) return
    if (exact) return addExisting(exact)
    setBusy(true)
    await kitchen.quickAddToList(name, categoryId || otherCategory?.id)
    setBusy(false)
    reset()
  }

  return (
    <div className="mb-6 overflow-hidden rounded-[12px] bg-surface shadow-card">
      <form
        onSubmit={e => { e.preventDefault(); submit() }}
        className="flex min-h-[50px] items-center gap-3 px-4"
      >
        <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-tint text-white">
          <Plus size={15} strokeWidth={3} />
        </span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Add an item"
          aria-label="Add an item to your grocery list"
          className="h-12 min-w-0 flex-1 bg-transparent text-[17px] text-label placeholder:text-label-2 focus:outline-none"
        />
        {q && (
          <TextButton onClick={submit} disabled={busy} className="font-semibold">
            {exact && onList.has(exact.id) ? 'Listed' : 'Add'}
          </TextButton>
        )}
      </form>

      {q && suggestions.length > 0 && (
        <div className="border-t border-separator">
          {suggestions.map(ingredient => (
            <button key={ingredient.id} type="button" onClick={() => addExisting(ingredient)} className="flex w-full items-center justify-between gap-3 border-b border-separator py-2.5 pl-[3.25rem] pr-4 text-left last:border-b-0 hover:bg-fill">
              <span className="truncate text-[17px] text-label">{ingredient.name}</span>
              <span className="shrink-0 text-[13px] text-label-2">{ingredient.category?.icon} {ingredient.category?.name}</span>
            </button>
          ))}
        </div>
      )}

      {q && !exact && (
        <div className="border-t border-separator">
          <p className="px-4 pt-3 text-[13px] text-label-2">New item — which aisle?</p>
          <TokenPicker
            value={categoryId || otherCategory?.id}
            onChange={setCategoryId}
            options={ingredientCategories.map(c => ({ value: c.id, label: c.name, icon: c.icon }))}
          />
        </div>
      )}
    </div>
  )
}

export default function GroceriesTab({ kitchen, showUndo }) {
  const { cart, ingredientsById, ingredientCategories, mealsById } = kitchen
  const [confirmClear, setConfirmClear] = useState(false)

  // One line per ingredient, even if several meals asked for it.
  const lines = useMemo(() => {
    const byKey = new Map()
    cart.forEach(row => {
      const key = `${row.ingredient_id}:${row.checked}`
      if (!byKey.has(key)) byKey.set(key, { key, ingredient: ingredientsById.get(row.ingredient_id), checked: row.checked, rows: [] })
      byKey.get(key).rows.push(row)
    })
    return [...byKey.values()]
      .filter(line => line.ingredient)
      .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name))
  }, [cart, ingredientsById])

  const toBuy = lines.filter(l => !l.checked)
  const pickedUp = lines.filter(l => l.checked)
  const total = toBuy.length + pickedUp.length

  const aisles = ingredientCategories
    .map(category => ({ category, lines: toBuy.filter(l => l.ingredient.ingredient_category_id === category.id) }))
    .concat([{ category: { id: 'none', name: 'Other', icon: '🛒' }, lines: toBuy.filter(l => !l.ingredient.category) }])
    .filter(a => a.lines.length > 0)

  const mealsOnList = useMemo(() => {
    const byMeal = new Map()
    cart.forEach(row => {
      const meal = row.meal_id && mealsById.get(row.meal_id)
      if (!meal) return
      if (!byMeal.has(meal.id)) byMeal.set(meal.id, { meal, rows: [] })
      byMeal.get(meal.id).rows.push(row)
    })
    return [...byMeal.values()]
  }, [cart, mealsById])

  const optionalFor = (row) => {
    const meal = row.meal_id && mealsById.get(row.meal_id)
    return Boolean(meal?.meal_ingredients.some(link => link.ingredient_id === row.ingredient_id && link.optional))
  }

  const remove = async (rows, message) => {
    const undo = await kitchen.removeFromList(rows)
    showUndo({ message, undo })
  }

  const clearPickedUp = () => {
    const rows = pickedUp.flatMap(l => l.rows)
    remove(rows, `Cleared ${pluralize(pickedUp.length, 'item')}`)
  }

  const clearAll = () => remove(cart, `Cleared ${pluralize(total, 'item')}`)

  const renderLine = (line) => {
    const mealNames = [...new Set(line.rows.map(r => mealsById.get(r.meal_id)?.name).filter(Boolean))]
    const optional = line.rows.every(r => r.meal_id && optionalFor(r))
    return (
      <Row
        key={line.key}
        onClick={() => kitchen.setPickedUp(line.rows, !line.checked)}
        leading={<CheckCircle checked={line.checked} onClick={() => kitchen.setPickedUp(line.rows, !line.checked)} label={`Picked up ${line.ingredient.name}`} />}
        title={line.ingredient.name}
        titleClassName={cx(line.checked && 'text-label-2 line-through decoration-label-3')}
        subtitle={(mealNames.length > 0 || optional) && (
          <span className="flex items-center gap-1.5">
            {optional && <span className="text-indigo">Optional</span>}
            {optional && mealNames.length > 0 && '·'}
            {mealNames.length > 0 && <span className="truncate">For {mealNames.join(', ')}</span>}
          </span>
        )}
        trailing={(
          <button
            type="button"
            onClick={() => remove(line.rows, `Removed ${line.ingredient.name}`)}
            aria-label={`Remove ${line.ingredient.name}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-label-3 transition-colors hover:bg-fill hover:text-red"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        )}
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Groceries"
        subtitle={total === 0 ? 'Your shopping list' : toBuy.length === 0 ? 'All picked up' : `${pluralize(toBuy.length, 'item')} to buy`}
      >
        {total > 0 && <TextButton onClick={() => setConfirmClear(true)}>Clear</TextButton>}
      </PageHeader>

      <QuickAdd kitchen={kitchen} />

      {total > 0 && (
        <div className="mb-6 rounded-[12px] bg-surface p-4 shadow-card">
          <div className="mb-2.5 flex items-baseline justify-between">
            <p className="text-[15px] font-semibold text-label">
              {pickedUp.length} of {total} picked up
            </p>
            <p className="text-[13px] tabular-nums text-label-2">{Math.round((pickedUp.length / total) * 100)}%</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-fill">
            <div className="h-full rounded-full bg-green transition-[width] duration-500" style={{ width: `${(pickedUp.length / total) * 100}%` }} />
          </div>
          {mealsOnList.length > 0 && (
            <div className="-mx-4 mt-4 overflow-x-auto px-4 no-scrollbar">
              <div className="flex w-max gap-2">
                {mealsOnList.map(({ meal, rows }) => {
                  const got = rows.filter(r => r.checked).length
                  return (
                    <span key={meal.id} className="flex h-8 items-center gap-2 rounded-full bg-fill pl-3 pr-1 text-[13px] font-medium text-label">
                      {meal.name}
                      <span className={cx('tabular-nums', got === rows.length ? 'text-green' : 'text-label-2')}>{got}/{rows.length}</span>
                      <button
                        type="button"
                        onClick={() => remove(rows, `Removed ${meal.name} from list`)}
                        aria-label={`Remove ${meal.name} items`}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-label-2 hover:bg-fill-strong"
                      >
                        <X size={13} strokeWidth={2.6} />
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {total === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nothing to buy"
          message="Add items above, or open a meal and add what’s missing."
        />
      ) : (
        <>
          {aisles.map(({ category, lines: aisleLines }) => (
            <Section key={category.id} title={`${category.icon} ${category.name}`}>
              {aisleLines.map(renderLine)}
            </Section>
          ))}

          {toBuy.length === 0 && (
            <div className="mb-7 rounded-[12px] bg-green/12 px-4 py-4 text-center">
              <p className="text-[17px] font-semibold text-green">All done!</p>
              <p className="text-[13px] text-label-2">Picked-up items are already marked in stock.</p>
            </div>
          )}

          {pickedUp.length > 0 && (
            <Section
              title={`Picked up · ${pickedUp.length}`}
              trailing={<TextButton onClick={clearPickedUp} className="text-[13px]">Clear</TextButton>}
              footer="Picked-up items are marked as in stock in your pantry."
            >
              {pickedUp.map(renderLine)}
            </Section>
          )}

          <div className="pb-4 text-center">
            <Button variant="danger" size="md" onClick={() => setConfirmClear(true)}>Clear List…</Button>
          </div>
        </>
      )}

      <ActionSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear your grocery list?"
        actions={[
          ...(pickedUp.length > 0 && toBuy.length > 0 ? [{ label: `Clear Picked Up (${pickedUp.length})`, onClick: clearPickedUp }] : []),
          { label: `Clear All (${total})`, destructive: true, onClick: clearAll },
        ]}
      />
    </>
  )
}
