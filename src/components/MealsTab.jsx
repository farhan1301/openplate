import { useMemo, useState } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import { cx } from '../lib/cx'
import { mealReadiness, normalizedName, pluralize, sortMealCategories } from '../lib/kitchen'
import MealDetail from './MealDetail'
import MealEditor from './MealEditor'
import MealCard from './MealCard'
import {
  AddButton, Button, Chip, ChipRow, EmptyState, PageHeader, SearchField,
} from './ui'

const SECTIONS = [
  { status: 'ready', title: 'Ready to cook', footer: 'You have every essential ingredient at home.' },
  { status: 'almost', title: 'Almost there', footer: 'Just one or two things away.' },
  { status: 'listed', title: 'Waiting on groceries', footer: 'Everything missing is already on your grocery list.' },
  { status: 'missing', title: 'Needs shopping' },
  { status: 'empty', title: 'No ingredients yet', footer: 'Add ingredients to these so the app can track them.' },
]

export default function MealsTab({ kitchen, showUndo }) {
  const { meals, mealCategories, inStock, onList, ingredientsById, favorites } = kitchen
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [openMealId, setOpenMealId] = useState(null)
  const [editing, setEditing] = useState(null) // { meal } — meal is null for a new one

  const categories = sortMealCategories(mealCategories)
  const categoryNames = new Map(mealCategories.map(c => [c.id, c.name]))
  const favoriteMealIds = new Set(favorites.map(f => f.meal_id).filter(Boolean))
  const openMeal = openMealId ? kitchen.mealsById.get(openMealId) : null

  const scored = useMemo(() => meals.map(meal => ({ meal, readiness: mealReadiness(meal, inStock, onList) })), [meals, inStock, onList])
  const readyCount = scored.filter(s => s.readiness.status === 'ready').length

  const filtered = scored.filter(({ meal }) =>
    (categoryId === 'all' || meal.meal_category_id === categoryId)
    && normalizedName(meal.name).includes(normalizedName(search)))

  const deleteMeal = (meal) => {
    setOpenMealId(null)
    const { undo, commit } = kitchen.deleteMeal(meal)
    showUndo({ message: `Deleted “${meal.name}”`, undo, commit })
  }

  return (
    <>
      <PageHeader
        title="Meals"
        subtitle={meals.length ? `${readyCount} of ${pluralize(meals.length, 'meal')} ready to cook` : 'Your recipes, matched to your pantry'}
      >
        <AddButton label="New Meal" onClick={() => setEditing({ meal: null })} />
      </PageHeader>

      {meals.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="No meals yet"
          message="Add the meals you like to cook and see which ones you can make with what’s at home."
          action={<Button size="md" onClick={() => setEditing({ meal: null })}>Add a Meal</Button>}
        />
      ) : (
        <>
          <div className="mb-3"><SearchField value={search} onChange={setSearch} placeholder="Search meals" /></div>
          {categories.length > 1 && (
            <div className="mb-6">
              <ChipRow>
                <Chip active={categoryId === 'all'} onClick={() => setCategoryId('all')}>All</Chip>
                {categories.map(c => (
                  <Chip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</Chip>
                ))}
              </ChipRow>
            </div>
          )}

          {SECTIONS.map(section => {
            const rows = filtered.filter(s => s.readiness.status === section.status)
            if (rows.length === 0) return null
            return (
              <section key={section.status} className="mb-8">
                <h2 className="px-1 text-[20px] font-bold tracking-[-0.01em] text-label">
                  {section.title} <span className="text-[15px] font-normal text-label-2">{rows.length}</span>
                </h2>
                {section.footer && <p className="mb-3 px-1 text-[13px] text-label-2">{section.footer}</p>}
                <div className={cx('grid grid-cols-2 gap-3 sm:grid-cols-3', !section.footer && 'mt-3')}>
                  {rows.map(({ meal, readiness }) => (
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
                  ))}
                </div>
              </section>
            )
          })}

          {filtered.length === 0 && <EmptyState title="No results" message="Try a different search or category." />}
        </>
      )}

      {openMeal && !editing && (
        <MealDetail
          kitchen={kitchen}
          meal={openMeal}
          onClose={() => setOpenMealId(null)}
          onEdit={() => setEditing({ meal: openMeal })}
          onDelete={() => deleteMeal(openMeal)}
          showUndo={showUndo}
        />
      )}

      {editing && (
        <MealEditor
          kitchen={kitchen}
          meal={editing.meal}
          onClose={() => setEditing(null)}
          onSaved={id => setOpenMealId(id)}
        />
      )}
    </>
  )
}
