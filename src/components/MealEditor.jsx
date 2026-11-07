import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { normalizedName, sortMealCategories } from '../lib/kitchen'
import { ErrorBanner, FormGroup, Sheet, TextArea, TextInput, TokenPicker } from './ui'
import { PhotoField } from './FoodImage'
import { cx } from '../lib/cx'
import { NUTRIENTS } from '../lib/nutrition'

const itemsFromMeal = (meal, ingredientsById) => (meal?.meal_ingredients || []).map(link => {
  const ingredient = ingredientsById.get(link.ingredient_id)
  return {
    key: link.id,
    linkId: link.id,
    ingredient_id: link.ingredient_id,
    name: ingredient?.name || 'Ingredient',
    category: ingredient?.category || null,
    optional: Boolean(link.optional),
  }
})

export default function MealEditor({ kitchen, meal, onClose, onSaved }) {
  const { ingredients, ingredientsById, ingredientCategories, mealCategories, usage, categoriesById } = kitchen
  const categories = sortMealCategories(mealCategories)

  const [form, setForm] = useState(() => ({
    name: meal?.name || '',
    categoryId: meal?.meal_category_id || categories[0]?.id || '',
    prepTime: meal?.prep_time_minutes ? String(meal.prep_time_minutes) : '',
    description: meal?.description || '',
    imageUrl: meal?.image_url || '',
  }))
  // Per serving; empty = not recorded.
  const [nutrition, setNutrition] = useState(() => Object.fromEntries(NUTRIENTS.map(({ key }) => [key, meal?.[key] == null ? '' : String(meal[key])])))
  const [items, setItems] = useState(() => itemsFromMeal(meal, ingredientsById))
  const [removedLinkIds, setRemovedLinkIds] = useState([])
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(null) // { name, categoryId } for a brand-new ingredient
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key) => (value) => setForm(prev => ({ ...prev, [key]: value }))

  const usedNames = useMemo(() => new Set(items.map(item => normalizedName(item.name))), [items])

  const suggestions = useMemo(() => {
    const q = normalizedName(query)
    if (!q) return []
    return ingredients
      .filter(i => normalizedName(i.name).includes(q) && !usedNames.has(normalizedName(i.name)))
      .sort((a, b) => Number(normalizedName(b.name).startsWith(q)) - Number(normalizedName(a.name).startsWith(q)) || (usage[b.id] || 0) - (usage[a.id] || 0))
      .slice(0, 6)
  }, [ingredients, query, usage, usedNames])

  const exactMatch = ingredients.find(i => normalizedName(i.name) === normalizedName(query))

  const frequent = useMemo(() => ingredients
    .filter(i => (usage[i.id] || 0) > 0 && !usedNames.has(normalizedName(i.name)))
    .sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0))
    .slice(0, 12), [ingredients, usage, usedNames])

  const addExisting = (ingredient) => {
    if (usedNames.has(normalizedName(ingredient.name))) return
    setItems(prev => [...prev, {
      key: `new-${ingredient.id}`,
      ingredient_id: ingredient.id,
      name: ingredient.name,
      category: ingredient.category,
      optional: false,
    }])
    setQuery('')
    setCreating(null)
  }

  const startCreate = () => {
    const name = query.trim()
    if (!name || usedNames.has(normalizedName(name))) return
    const other = ingredientCategories.find(c => c.name === 'Other')
    setCreating({ name, categoryId: other?.id || ingredientCategories[0]?.id || '' })
  }

  const finishCreate = () => {
    if (!creating?.name) return
    setItems(prev => [...prev, {
      key: `create-${normalizedName(creating.name)}`,
      name: creating.name,
      categoryId: creating.categoryId,
      category: categoriesById.get(creating.categoryId) || null,
      optional: false,
    }])
    setCreating(null)
    setQuery('')
  }

  const onQueryKey = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (exactMatch) addExisting(exactMatch)
    else if (suggestions.length === 1) addExisting(suggestions[0])
    else startCreate()
  }

  const removeItem = (item) => {
    setItems(prev => prev.filter(i => i.key !== item.key))
    if (item.linkId) setRemovedLinkIds(prev => [...prev, item.linkId])
  }

  const toggleOptional = (item) => setItems(prev => prev.map(i => i.key === item.key ? { ...i, optional: !i.optional } : i))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const perServing = Object.fromEntries(Object.entries(nutrition).map(([key, text]) => {
        const n = parseFloat(String(text).replace(',', '.'))
        return [key, Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null]
      }))
      const id = await kitchen.saveMeal({ id: meal?.id, ...form, nutrition: perServing, items, removedLinkIds })
      onSaved?.(id)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save this meal.')
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={meal ? 'Edit Meal' : 'New Meal'}
      confirmLabel={saving ? 'Saving…' : 'Save'}
      onConfirm={save}
      confirmDisabled={saving || !form.name.trim()}
    >
      <ErrorBanner message={error} />

      <FormGroup>
        <TextInput value={form.name} onChange={set('name')} placeholder="Meal name" autoFocus={!meal} />
        <TextInput value={form.prepTime} onChange={set('prepTime')} placeholder="Prep time in minutes (optional)" type="number" inputMode="numeric" />
      </FormGroup>

      <PhotoField
        value={form.imageUrl}
        onChange={set('imageUrl')}
        name={form.name}
        hint={{ category: mealCategories.find(c => c.id === form.categoryId)?.name }}
      />

      {categories.length > 0 && (
        <FormGroup title="Category">
          <TokenPicker
            value={form.categoryId}
            onChange={set('categoryId')}
            options={categories.map(c => ({ value: c.id, label: c.name }))}
          />
        </FormGroup>
      )}

      <FormGroup
        title={`Ingredients${items.length ? ` · ${items.length}` : ''}`}
        footer="Tap “Essential” to mark an ingredient optional. Optional ones don’t stop a meal from being ready."
      >
        {items.map(item => (
          <div key={item.key} className="flex min-h-[44px] items-center gap-3 border-b border-separator px-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] text-label">{item.name}</p>
              {item.category && <p className="truncate text-[13px] text-label-2">{item.category.icon} {item.category.name}</p>}
            </div>
            <button
              type="button"
              onClick={() => toggleOptional(item)}
              className={cx('h-7 rounded-full px-3 text-[13px] font-semibold transition-colors', item.optional ? 'bg-fill text-label-2' : 'bg-green/14 text-green')}
            >
              {item.optional ? 'Optional' : 'Essential'}
            </button>
            <button type="button" onClick={() => removeItem(item)} aria-label={`Remove ${item.name}`} className="flex h-7 w-7 items-center justify-center rounded-full text-label-3 hover:bg-fill hover:text-red">
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>
        ))}

        {creating ? (
          <div className="border-b border-separator last:border-b-0">
            <div className="flex items-center justify-between gap-3 px-4 pt-3">
              <p className="text-[15px] text-label">Which aisle is <span className="font-semibold">{creating.name}</span> in?</p>
              <button type="button" onClick={() => setCreating(null)} className="text-[15px] text-label-2">Cancel</button>
            </div>
            <TokenPicker
              value={creating.categoryId}
              onChange={categoryId => setCreating(prev => ({ ...prev, categoryId }))}
              options={ingredientCategories.map(c => ({ value: c.id, label: c.name, icon: c.icon }))}
            />
            <div className="px-3 pb-3">
              <button type="button" onClick={finishCreate} className="h-10 w-full rounded-[10px] bg-tint text-[15px] font-semibold text-white">
                Add {creating.name}
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="flex min-h-[44px] items-center gap-3 px-4">
              <Plus size={20} className="shrink-0 text-tint" strokeWidth={2.4} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onQueryKey}
                placeholder="Add ingredient"
                className="h-11 min-w-0 flex-1 bg-transparent text-[17px] text-label placeholder:text-tint focus:outline-none focus:placeholder:text-label-3"
              />
            </label>
            {query.trim() && (
              <div className="border-t border-separator bg-fill/40">
                {suggestions.map(ingredient => (
                  <button key={ingredient.id} type="button" onClick={() => addExisting(ingredient)} className="flex w-full items-center justify-between gap-3 border-b border-separator px-4 py-2.5 text-left last:border-b-0 hover:bg-fill">
                    <span className="truncate text-[17px] text-label">{ingredient.name}</span>
                    <span className="shrink-0 text-[13px] text-label-2">{ingredient.category?.icon} {ingredient.category?.name}</span>
                  </button>
                ))}
                {!exactMatch && !usedNames.has(normalizedName(query)) && (
                  <button type="button" onClick={startCreate} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[17px] text-tint hover:bg-fill">
                    <Plus size={16} strokeWidth={2.4} /> Create “{query.trim()}”
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </FormGroup>

      {frequent.length > 0 && !query && !creating && (
        <div className="-mt-3 mb-6">
          <p className="mb-2 px-4 text-[13px] uppercase tracking-[0.02em] text-label-2">Frequently used</p>
          <div className="flex flex-wrap gap-2 px-1">
            {frequent.map(ingredient => (
              <button key={ingredient.id} type="button" onClick={() => addExisting(ingredient)} className="flex h-8 items-center gap-1 rounded-full bg-surface px-3 text-[15px] text-label shadow-card hover:bg-fill dark:bg-elevated">
                <Plus size={14} className="text-tint" strokeWidth={2.6} /> {ingredient.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <FormGroup title="Nutrition per serving" footer="Optional. Fills in the numbers when you log this meal in Nutrition. Your AI agent can estimate these for you.">
        {NUTRIENTS.map(({ key, label, unit }) => (
          <TextInput key={key} label={label} value={nutrition[key]} onChange={value => setNutrition(prev => ({ ...prev, [key]: value }))} type="number" inputMode="decimal" placeholder={unit} />
        ))}
      </FormGroup>

      <FormGroup title="Notes">
        <TextArea value={form.description} onChange={set('description')} placeholder="Recipe notes, tips, links…" />
      </FormGroup>
    </Sheet>
  )
}
