import { useMemo, useState } from 'react'
import { ChevronRight, Package, Plus, ShoppingBag, Sparkles, UtensilsCrossed } from 'lucide-react'
import { mealReadiness, pluralize } from '../lib/kitchen'
import MealCard from './MealCard'
import MealDetail from './MealDetail'
import MealEditor from './MealEditor'
import MyRules from './MyRules'
import TrainingCard from './TrainingCard'
import { FavoriteCard, FavoriteEditor } from './FavoritesTab'
import { Button, EmptyState, PageHeader } from './ui'
import { cx } from '../lib/cx'

const READINESS_ORDER = { ready: 0, listed: 1, almost: 2, missing: 3, empty: 4 }

function greeting(user) {
  const hour = new Date().getHours()
  const part = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = user?.user_metadata?.full_name?.split(' ')[0]
  return first ? `${part}, ${first}` : part
}

function SectionHead({ title, subtitle, action, onAction }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <h2 className="text-[22px] font-bold tracking-[-0.01em] text-label">{title}</h2>
        {subtitle && <p className="text-[13px] text-label-2">{subtitle}</p>}
      </div>
      {action && (
        <button type="button" onClick={onAction} className="flex shrink-0 items-center text-[15px] text-tint hover:opacity-70">
          {action} <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}

function Shelf({ children }) {
  return (
    <div className="no-scrollbar -mx-4 snap-x snap-mandatory overflow-x-auto px-4 md:-mx-8 md:px-8">
      <div className="flex w-max gap-3 pb-1">{children}</div>
    </div>
  )
}

function StatTile({ icon: Icon, value, label, tone, onClick }) {
  const tones = { green: 'text-green bg-green/14', tint: 'text-tint bg-tint/14', orange: 'text-orange bg-orange/14' }
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-start rounded-[16px] bg-surface p-3 text-left shadow-card transition-transform active:scale-[0.97]">
      <span className={cx('mb-2 flex h-7 w-7 items-center justify-center rounded-full', tones[tone])}>
        <Icon size={15} strokeWidth={2.4} />
      </span>
      <span className="text-[26px] font-bold leading-none tabular-nums text-label">{value}</span>
      <span className="mt-1 text-[12px] leading-tight text-label-2">{label}</span>
    </button>
  )
}

export default function HomeTab({ kitchen, showUndo, user, onNavigate }) {
  const { meals, mealCategories, inStock, onList, ingredientsById, favorites, mealsById, cart, pantryItems } = kitchen
  const [openMealId, setOpenMealId] = useState(null)
  const [editingMeal, setEditingMeal] = useState(null) // { meal } — null meal means new
  const [editingFavorite, setEditingFavorite] = useState(null) // { favorite }
  const openMeal = openMealId ? mealsById.get(openMealId) : null

  const categoryNames = new Map(mealCategories.map(c => [c.id, c.name]))
  const favoriteMealIds = new Set(favorites.map(f => f.meal_id).filter(Boolean))

  const scored = useMemo(() => meals
    .map(meal => ({ meal, readiness: mealReadiness(meal, inStock, onList) }))
    .sort((a, b) => READINESS_ORDER[a.readiness.status] - READINESS_ORDER[b.readiness.status]
      || (a.readiness.total - a.readiness.have) - (b.readiness.total - b.readiness.have)
      || a.meal.name.localeCompare(b.meal.name)), [meals, inStock, onList])
  const readinessById = new Map(scored.map(s => [s.meal.id, s.readiness]))

  const ready = scored.filter(s => s.readiness.status === 'ready')
  const close = scored.filter(s => s.readiness.status === 'almost' || s.readiness.status === 'listed')
  const waitingOnList = scored.filter(s => s.readiness.status === 'listed').length

  // One more item away: buying it (plus what's already on the list) makes these meals ready.
  const bestBuys = useMemo(() => {
    const unlocks = new Map()
    scored.forEach(({ meal, readiness }) => {
      if (readiness.status === 'ready' || readiness.status === 'empty' || readiness.toBuy.length !== 1) return
      const id = readiness.toBuy[0].ingredient_id
      if (!unlocks.has(id)) unlocks.set(id, [])
      unlocks.get(id).push(meal.name)
    })
    return [...unlocks.entries()]
      .map(([id, names]) => ({ ingredient: ingredientsById.get(id), names }))
      .filter(b => b.ingredient)
      .sort((a, b) => b.names.length - a.names.length || a.ingredient.name.localeCompare(b.ingredient.name))
      .slice(0, 4)
  }, [scored, ingredientsById])

  const toBuy = cart.filter(row => !row.checked)
  const toBuyNames = [...new Set(toBuy.map(row => ingredientsById.get(row.ingredient_id)?.name).filter(Boolean))]
  const inStockCount = pantryItems.filter(i => i.inStock).length

  const dishes = favorites
    .filter(f => f.kind === 'dish')
    .map(f => ({ favorite: f, meal: f.meal_id ? mealsById.get(f.meal_id) : null }))
    .sort((a, b) => {
      const ra = a.meal ? readinessById.get(a.meal.id)?.status === 'ready' : false
      const rb = b.meal ? readinessById.get(b.meal.id)?.status === 'ready' : false
      return Number(rb) - Number(ra) || (b.favorite.rating || 0) - (a.favorite.rating || 0) || a.favorite.name.localeCompare(b.favorite.name)
    })
  const restaurants = favorites
    .filter(f => f.kind === 'restaurant')
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name))
  const cuisines = [...new Set(favorites.map(f => f.cuisine?.trim()).filter(Boolean))]

  const openFavorite = (favorite) => {
    const meal = favorite.meal_id ? mealsById.get(favorite.meal_id) : null
    if (meal) setOpenMealId(meal.id)
    else setEditingFavorite({ favorite })
  }

  const deleteMeal = (meal) => {
    setOpenMealId(null)
    const { undo, commit } = kitchen.deleteMeal(meal)
    showUndo({ message: `Deleted “${meal.name}”`, undo, commit })
  }

  const removeFavorite = async (favorite) => {
    setEditingFavorite(null)
    const undo = await kitchen.deleteFavorite(favorite)
    showUndo({ message: `Removed “${favorite.name}”`, undo })
  }

  const card = ({ meal, readiness }) => (
    <MealCard
      key={meal.id}
      meal={meal}
      readiness={readiness}
      favorite={favoriteMealIds.has(meal.id)}
      categoryName={categoryNames.get(meal.meal_category_id)}
      ingredientsById={ingredientsById}
      onOpen={() => setOpenMealId(meal.id)}
      onShop={kitchen.addToList}
    />
  )

  const isReady = (meal) => readinessById.get(meal.id)?.status === 'ready'

  return (
    <>
      <PageHeader
        title={greeting(user)}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      />

      <MyRules />

      {meals.length === 0 && favorites.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Your kitchen is empty"
          message="Add the meals you like to cook, or ask your AI agent to add them, and they’ll show up here with photos."
          action={<Button size="md" onClick={() => setEditingMeal({ meal: null })}>Add a Meal</Button>}
        />
      ) : (
        <>
          <div className="mb-8 grid grid-cols-3 gap-3">
            <StatTile icon={UtensilsCrossed} tone="green" value={ready.length} label={`of ${pluralize(meals.length, 'meal')} ready`} onClick={() => onNavigate('meals')} />
            <StatTile icon={ShoppingBag} tone="tint" value={toBuyNames.length} label="to buy" onClick={() => onNavigate('groceries')} />
            <StatTile icon={Package} tone="orange" value={inStockCount} label={`of ${pantryItems.length} in stock`} onClick={() => onNavigate('pantry')} />
          </div>

          <TrainingCard onOpen={() => onNavigate('fitness')} />

          <section className="mb-9">
            <SectionHead
              title="Cook tonight"
              subtitle={ready.length ? 'Everything you need is at home' : 'Nothing is fully stocked yet'}
              action={meals.length > ready.length ? 'All meals' : null}
              onAction={() => onNavigate('meals')}
            />
            {ready.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{ready.map(card)}</div>
            ) : (
              <div className="rounded-[16px] bg-surface px-4 py-5 text-[15px] text-label-2 shadow-card">
                {close.length ? 'These are the closest — tap the bag on a card to add what’s missing to your list.' : 'Add ingredients to your meals and mark what’s in your pantry to see what you can cook.'}
              </div>
            )}
          </section>

          {dishes.length > 0 && (
            <section className="mb-9">
              <SectionHead title="Your cravings" subtitle="Favorite dishes" action="Favorites" onAction={() => onNavigate('favorites')} />
              <Shelf>
                {dishes.map(({ favorite, meal }) => (
                  <div key={favorite.id} className="w-[44vw] max-w-[200px] shrink-0 snap-start sm:w-[190px]">
                    <FavoriteCard favorite={favorite} meal={meal} ready={meal ? isReady(meal) : false} onClick={() => openFavorite(favorite)} />
                  </div>
                ))}
              </Shelf>
            </section>
          )}

          {close.length > 0 && (
            <section className="mb-9">
              <SectionHead
                title="Almost there"
                subtitle={waitingOnList ? `${pluralize(waitingOnList, 'meal')} ready after your next shop` : 'One or two things away'}
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{close.map(card)}</div>
            </section>
          )}

          <section className="mb-9">
            <SectionHead title="Grocery list" action="Open" onAction={() => onNavigate('groceries')} />
            <div className="overflow-hidden rounded-[16px] bg-surface shadow-card">
              <div className="p-4">
                {toBuyNames.length ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {toBuyNames.slice(0, 14).map(name => (
                        <span key={name} className="rounded-full bg-fill px-2.5 py-1 text-[13px] text-label">{name}</span>
                      ))}
                      {toBuyNames.length > 14 && <span className="px-1 py-1 text-[13px] text-label-2">+{toBuyNames.length - 14} more</span>}
                    </div>
                    {waitingOnList > 0 && (
                      <p className="mt-3 text-[13px] text-label-2">
                        Buying these makes <span className="font-semibold text-tint">{pluralize(waitingOnList, 'more meal')}</span> ready.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[15px] text-label-2">Nothing to buy right now.</p>
                )}
              </div>
              {bestBuys.length > 0 && (
                <div className="border-t border-separator">
                  <p className="flex items-center gap-1.5 px-4 pb-1 pt-3 text-[13px] font-semibold uppercase tracking-[0.02em] text-label-2">
                    <Sparkles size={13} className="text-orange" /> Best next buys
                  </p>
                  {bestBuys.map(({ ingredient, names }) => (
                    <div key={ingredient.id} className="flex items-center gap-3 border-b border-separator px-4 py-2.5 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-label">{ingredient.name}</p>
                        <p className="truncate text-[12px] text-label-2">Unlocks {names.join(', ')}</p>
                      </div>
                      <Button size="sm" variant="tinted" onClick={() => kitchen.addToList([ingredient.id])}>
                        <Plus size={13} strokeWidth={2.6} /> List
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {restaurants.length > 0 && (
            <section className="mb-9">
              <SectionHead title="Eat out" subtitle="Favorite restaurants" action="Favorites" onAction={() => onNavigate('favorites')} />
              <Shelf>
                {restaurants.map(favorite => (
                  <div key={favorite.id} className="w-[44vw] max-w-[200px] shrink-0 snap-start sm:w-[190px]">
                    <FavoriteCard favorite={favorite} onClick={() => openFavorite(favorite)} />
                  </div>
                ))}
              </Shelf>
            </section>
          )}

          {meals.length > ready.length + close.length && (
            <button
              type="button"
              onClick={() => onNavigate('meals')}
              className="mb-4 flex w-full items-center justify-between rounded-[16px] bg-surface px-4 py-3.5 text-left shadow-card hover:bg-fill/40"
            >
              <span className="text-[15px] text-label">Browse all {pluralize(meals.length, 'meal')}</span>
              <ChevronRight size={18} className="text-label-3" />
            </button>
          )}
        </>
      )}

      {openMeal && !editingMeal && !editingFavorite && (
        <MealDetail
          kitchen={kitchen}
          meal={openMeal}
          onClose={() => setOpenMealId(null)}
          onEdit={() => setEditingMeal({ meal: openMeal })}
          onDelete={() => deleteMeal(openMeal)}
          showUndo={showUndo}
          onEditFavorite={favorite => setEditingFavorite({ favorite })}
        />
      )}

      {editingMeal && (
        <MealEditor
          kitchen={kitchen}
          meal={editingMeal.meal}
          onClose={() => setEditingMeal(null)}
          onSaved={id => setOpenMealId(id)}
        />
      )}

      {editingFavorite && (
        <FavoriteEditor
          kitchen={kitchen}
          favorite={editingFavorite.favorite}
          defaultKind="dish"
          cuisines={cuisines}
          onClose={() => setEditingFavorite(null)}
          onDelete={() => removeFavorite(editingFavorite.favorite)}
        />
      )}
    </>
  )
}
