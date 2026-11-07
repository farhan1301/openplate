import { useMemo, useState } from 'react'
import { Heart, MapPin, Plus, X } from 'lucide-react'
import { COMMON_CUISINES, normalizedName, pluralize } from '../lib/kitchen'
import {
  ActionSheet, AddButton, Button, Chip, ChipRow, EmptyState, ErrorBanner, FormGroup, PageHeader,
  SearchField, Segmented, Sheet, Stars, TextArea, TextInput,
} from './ui'
import MealDetail from './MealDetail'
import MealEditor from './MealEditor'
import { FoodImage, PhotoField } from './FoodImage'

const emptyFavorite = (kind) => ({ kind, name: '', cuisine: '', place: '', location: '', rating: 0, notes: '', meal_id: null, tags: [], image_url: '' })

export function FavoriteEditor({ kitchen, favorite, defaultKind, cuisines, onClose, onDelete }) {
  const { meals } = kitchen
  // Database rows use null for blank fields; the form wants empty strings.
  const [form, setForm] = useState(() => {
    const base = emptyFavorite(favorite?.kind || defaultKind)
    if (!favorite) return base
    return Object.fromEntries(Object.entries({ ...base, ...favorite }).map(([key, value]) => [key, value ?? base[key] ?? null]))
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const set = (key) => (value) => setForm(f => ({ ...f, [key]: value }))

  // Tags are free-form labels shown on the card, e.g. "South Indian" under Indian.
  const [tagDraft, setTagDraft] = useState('')
  const hasTag = (tag) => form.tags.some(t => normalizedName(t) === normalizedName(tag))
  const addTag = (raw) => {
    const tag = raw.trim()
    if (tag && !hasTag(tag)) setForm(f => ({ ...f, tags: [...f.tags, tag] }))
    setTagDraft('')
  }
  const removeTag = (tag) => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))
  const tagSuggestions = [...new Set(kitchen.favorites.flatMap(f => f.tags || []))]
    .filter(t => !hasTag(t) && normalizedName(t).includes(normalizedName(tagDraft)))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 12)
  const isDish = form.kind === 'dish'

  const cuisineOptions = [...new Set([...cuisines, ...COMMON_CUISINES])]
    .filter(c => !form.cuisine || normalizedName(c).includes(normalizedName(form.cuisine)))
    .filter(c => normalizedName(c) !== normalizedName(form.cuisine))
    .slice(0, 10)

  const save = async () => {
    setSaving(true)
    try {
      const clean = (v) => (typeof v === 'string' ? v.trim() || null : v)
      await kitchen.saveFavorite({
        id: favorite?.id,
        kind: form.kind,
        name: form.name.trim(),
        cuisine: clean(form.cuisine),
        place: isDish ? clean(form.place) : null,
        location: clean(form.location),
        rating: form.rating || null,
        notes: clean(form.notes),
        tags: form.tags,
        meal_id: isDish ? form.meal_id || null : null,
        image_url: clean(form.image_url),
      })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save this favorite.')
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={favorite ? 'Edit Favorite' : 'New Favorite'}
      confirmLabel={saving ? 'Saving…' : 'Save'}
      onConfirm={save}
      confirmDisabled={saving || !form.name.trim()}
    >
      <ErrorBanner message={error} />

      {!favorite && (
        <Segmented
          className="mb-6"
          value={form.kind}
          onChange={set('kind')}
          options={[{ value: 'dish', label: 'Dish' }, { value: 'restaurant', label: 'Restaurant' }]}
        />
      )}

      <FormGroup>
        <TextInput value={form.name} onChange={set('name')} placeholder={isDish ? 'Dish, e.g. Butter Chicken' : 'Restaurant name'} autoFocus={!favorite} />
        {isDish && <TextInput value={form.place || ''} onChange={set('place')} placeholder="Where — a restaurant, or Home" />}
        <TextInput value={form.location || ''} onChange={set('location')} placeholder="Area or address (optional)" />
      </FormGroup>

      <PhotoField
        value={form.image_url || ''}
        onChange={set('image_url')}
        name={form.name}
        hint={{ cuisine: form.cuisine, kind: form.kind }}
      />

      <FormGroup title="Cuisine">
        <TextInput value={form.cuisine || ''} onChange={set('cuisine')} placeholder="e.g. Pakistani, Thai, Italian" />
        {cuisineOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3">
            {cuisineOptions.map(c => (
              <button key={c} type="button" onClick={() => set('cuisine')(c)} className="h-8 rounded-full bg-fill px-3 text-[15px] text-label hover:bg-fill-strong">
                {c}
              </button>
            ))}
          </div>
        )}
      </FormGroup>

      <FormGroup title="Tags" footer="Optional labels shown on the card. It still groups under its cuisine.">
        {form.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-separator p-3">
            {form.tags.map(tag => (
              <span key={tag} className="flex h-8 items-center gap-1 rounded-full bg-tint/14 pl-3 pr-1 text-[15px] font-medium text-tint">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-tint/20">
                  <X size={13} strokeWidth={2.6} />
                </button>
              </span>
            ))}
          </div>
        )}
        <TextInput
          value={tagDraft}
          onChange={setTagDraft}
          placeholder="Add a tag, e.g. South Indian"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagDraft) }
          }}
        />
        {(tagDraft.trim() || tagSuggestions.length > 0) && (
          <div className="flex flex-wrap gap-2 p-3">
            {tagDraft.trim() && !hasTag(tagDraft) && !tagSuggestions.some(t => normalizedName(t) === normalizedName(tagDraft)) && (
              <button type="button" onClick={() => addTag(tagDraft)} className="flex h-8 items-center gap-1 rounded-full bg-tint px-3 text-[15px] font-medium text-white">
                <Plus size={14} strokeWidth={2.6} /> Add “{tagDraft.trim()}”
              </button>
            )}
            {tagSuggestions.map(tag => (
              <button key={tag} type="button" onClick={() => addTag(tag)} className="flex h-8 items-center gap-1 rounded-full bg-fill px-3 text-[15px] text-label hover:bg-fill-strong">
                <Plus size={14} className="text-tint" strokeWidth={2.6} /> {tag}
              </button>
            ))}
          </div>
        )}
      </FormGroup>

      <FormGroup title="Rating">
        <div className="flex items-center justify-between px-3 py-1.5">
          <Stars value={form.rating || 0} onChange={set('rating')} size={26} />
          {form.rating > 0 && <button type="button" onClick={() => set('rating')(0)} className="pr-1 text-[15px] text-label-2">Clear</button>}
        </div>
      </FormGroup>

      {isDish && meals.length > 0 && (
        <FormGroup title="Link to one of your meals" footer="Linked dishes show whether you can cook them right now.">
          <label className="flex min-h-[44px] items-center px-4">
            <select
              value={form.meal_id || ''}
              onChange={e => set('meal_id')(e.target.value || null)}
              className="h-11 w-full bg-transparent text-[17px] text-label focus:outline-none"
            >
              <option value="">Not linked</option>
              {meals.map(meal => <option key={meal.id} value={meal.id}>{meal.name}</option>)}
            </select>
          </label>
        </FormGroup>
      )}

      <FormGroup title="Notes">
        <TextArea value={form.notes || ''} onChange={set('notes')} placeholder={isDish ? 'What makes it great, what to order with it…' : 'Best dishes, when to go, who to bring…'} />
      </FormGroup>

      {favorite && (
        <>
          <FormGroup>
            <button type="button" onClick={() => setConfirmDelete(true)} className="h-11 w-full text-[17px] text-red hover:bg-fill">Remove from Favorites</button>
          </FormGroup>
          <ActionSheet
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Remove “${favorite.name}”?`}
            actions={[{ label: 'Remove', destructive: true, onClick: onDelete }]}
          />
        </>
      )}
    </Sheet>
  )
}

export function FavoriteCard({ favorite, meal, ready, onClick }) {
  const isDish = favorite.kind === 'dish'
  const where = isDish ? favorite.place : favorite.location
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full w-full flex-col overflow-hidden rounded-[16px] bg-surface text-left shadow-card transition-transform active:scale-[0.98]"
    >
      <div className="relative w-full">
        <FoodImage
          src={favorite.image_url || meal?.image_url}
          name={favorite.name}
          hint={{ cuisine: favorite.cuisine, kind: favorite.kind }}
          className="aspect-[4/3] w-full transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute left-2 top-2 inline-flex h-6 items-center rounded-full bg-black/55 px-2 text-[11px] font-semibold text-white backdrop-blur-md">
          {isDish ? (meal ? (ready ? 'Ready to cook' : 'Your recipe') : 'Dish') : 'Restaurant'}
        </span>
        {favorite.rating > 0 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/45 px-1.5 py-1 backdrop-blur-md">
            <Stars value={favorite.rating} size={11} />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-label">{favorite.name}</p>
        {where && (
          <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-label-2">
            {!isDish && <MapPin size={11} className="shrink-0" />}
            <span className="truncate">{isDish ? `at ${where}` : where}</span>
          </p>
        )}
        {favorite.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {favorite.tags.map(tag => (
              <span key={tag} className="rounded-full bg-tint/12 px-2 py-0.5 text-[11px] font-semibold text-tint">{tag}</span>
            ))}
          </div>
        )}
        {favorite.notes && <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-label-2">{favorite.notes}</p>}
      </div>
    </button>
  )
}

export default function FavoritesTab({ kitchen, showUndo }) {
  const { favorites, favoritesReady, mealsById, inStock } = kitchen
  const [kind, setKind] = useState('all')
  const [cuisine, setCuisine] = useState('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // { favorite } — null favorite means new
  const [openMealId, setOpenMealId] = useState(null) // recipe opened from a linked dish
  const [editingMeal, setEditingMeal] = useState(null)
  const openMeal = openMealId ? mealsById.get(openMealId) : null

  const dishes = favorites.filter(f => f.kind === 'dish').length
  const restaurants = favorites.length - dishes

  const cuisines = useMemo(() => {
    const counts = new Map()
    favorites.forEach(f => {
      const c = f.cuisine?.trim()
      if (c) counts.set(c, (counts.get(c) || 0) + 1)
    })
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [favorites])

  const q = normalizedName(search)
  const visible = favorites.filter(f =>
    (kind === 'all' || f.kind === kind)
    && (cuisine === 'all' || f.cuisine === cuisine)
    && (!q || [f.name, f.cuisine, f.place, f.location, f.notes, ...(f.tags || [])].some(v => normalizedName(v || '').includes(q))))

  const groups = useMemo(() => {
    const byCuisine = new Map()
    visible.forEach(f => {
      const key = f.cuisine?.trim() || 'Other'
      if (!byCuisine.has(key)) byCuisine.set(key, [])
      byCuisine.get(key).push(f)
    })
    return [...byCuisine.entries()].sort((a, b) => (a[0] === 'Other') - (b[0] === 'Other') || b[1].length - a[1].length || a[0].localeCompare(b[0]))
  }, [visible])

  const isReady = (meal) => {
    const essentials = meal.meal_ingredients.filter(l => !l.optional)
    return meal.meal_ingredients.length > 0 && essentials.every(l => inStock.has(l.ingredient_id))
  }

  const remove = async (favorite) => {
    setEditing(null)
    const undo = await kitchen.deleteFavorite(favorite)
    showUndo({ message: `Removed “${favorite.name}”`, undo })
  }

  const deleteMeal = (meal) => {
    setOpenMealId(null)
    const { undo, commit } = kitchen.deleteMeal(meal)
    showUndo({ message: `Deleted “${meal.name}”`, undo, commit })
  }

  const newKind = kind === 'restaurant' ? 'restaurant' : 'dish'

  return (
    <>
      <PageHeader
        title="Favorites"
        subtitle={favorites.length ? `${pluralize(dishes, 'dish', 'dishes')} · ${pluralize(restaurants, 'restaurant')}` : 'Dishes and places you love'}
      >
        <AddButton label="Add Favorite" onClick={() => setEditing({ favorite: null })} />
      </PageHeader>

      {!favoritesReady && (
        <ErrorBanner message="Favorites need the new “favorites” table. Run supabase/migrations/*_favorites.sql in your Supabase SQL editor." />
      )}

      {favorites.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No favorites yet"
          message="Save dishes you love and restaurants worth going back to, grouped by cuisine."
          action={<Button size="md" onClick={() => setEditing({ favorite: null })}>Add a Favorite</Button>}
        />
      ) : (
        <>
          <div className="mb-3"><SearchField value={search} onChange={setSearch} placeholder="Search favorites" /></div>
          <Segmented
            className="mb-4"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'All', count: favorites.length },
              { value: 'dish', label: 'Dishes', count: dishes },
              { value: 'restaurant', label: 'Restaurants', count: restaurants },
            ]}
          />
          {cuisines.length > 1 && (
            <div className="mb-6">
              <ChipRow>
                <Chip active={cuisine === 'all'} onClick={() => setCuisine('all')}>All cuisines</Chip>
                {cuisines.map(([name, count]) => (
                  <Chip key={name} active={cuisine === name} onClick={() => setCuisine(name)} count={count}>{name}</Chip>
                ))}
              </ChipRow>
            </div>
          )}

          {groups.map(([name, items]) => (
            <section key={name} className="mb-7">
              <h2 className="mb-2 px-1 text-[20px] font-bold tracking-[-0.01em] text-label">
                {name} <span className="text-[15px] font-normal text-label-2">{items.length}</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {items.map(favorite => {
                  const meal = favorite.meal_id ? mealsById.get(favorite.meal_id) : null
                  return (
                    <FavoriteCard
                      key={favorite.id}
                      favorite={favorite}
                      meal={meal}
                      ready={meal ? isReady(meal) : false}
                      onClick={() => (meal ? setOpenMealId(meal.id) : setEditing({ favorite }))}
                    />
                  )
                })}
              </div>
            </section>
          ))}

          {visible.length === 0 && <EmptyState title="No results" message="Try a different search or filter." />}
        </>
      )}

      {openMeal && !editing && !editingMeal && (
        <MealDetail
          kitchen={kitchen}
          meal={openMeal}
          onClose={() => setOpenMealId(null)}
          onEdit={() => setEditingMeal(openMeal)}
          onDelete={() => deleteMeal(openMeal)}
          onEditFavorite={favorite => setEditing({ favorite })}
        />
      )}

      {editingMeal && (
        <MealEditor kitchen={kitchen} meal={editingMeal} onClose={() => setEditingMeal(null)} />
      )}

      {editing && (
        <FavoriteEditor
          kitchen={kitchen}
          favorite={editing.favorite}
          defaultKind={newKind}
          cuisines={cuisines.map(([name]) => name)}
          onClose={() => setEditing(null)}
          onDelete={() => remove(editing.favorite)}
        />
      )}
    </>
  )
}
