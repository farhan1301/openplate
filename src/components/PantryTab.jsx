import { useState } from 'react'
import { Package, ShoppingBag } from 'lucide-react'
import { normalizedName, pluralize } from '../lib/kitchen'
import {
  ActionSheet, AddButton, Button, CheckCircle, Chip, ChipRow, EmptyState, ErrorBanner, FormGroup, PageHeader, Pill, Row,
  SearchField, Section, Segmented, Sheet, TextButton, TextInput, TokenPicker,
} from './ui'

function IngredientEditor({ kitchen, ingredient, onClose, onDelete }) {
  const { ingredientCategories } = kitchen
  const fallbackCategory = ingredientCategories.find(c => c.name === 'Other') || ingredientCategories[0]
  const [form, setForm] = useState({
    name: ingredient?.name || '',
    categoryId: ingredient?.ingredient_category_id || fallbackCategory?.id || '',
    inStock: ingredient ? ingredient.inStock : true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await kitchen.saveIngredient({ id: ingredient?.id, ...form })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save this item.')
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={ingredient ? 'Edit Item' : 'Add to Pantry'}
      confirmLabel={saving ? 'Saving…' : ingredient ? 'Save' : 'Add'}
      onConfirm={save}
      confirmDisabled={saving || !form.name.trim()}
    >
      <ErrorBanner message={error} />
      <FormGroup>
        <TextInput value={form.name} onChange={name => setForm(f => ({ ...f, name }))} placeholder="Item name, e.g. Basmati rice" autoFocus={!ingredient} />
      </FormGroup>
      <FormGroup title="Status">
        <div className="p-3">
          <Segmented
            value={form.inStock ? 'in' : 'out'}
            onChange={value => setForm(f => ({ ...f, inStock: value === 'in' }))}
            options={[{ value: 'in', label: 'In Stock' }, { value: 'out', label: 'Out of Stock' }]}
          />
        </div>
      </FormGroup>
      <FormGroup title="Aisle">
        <TokenPicker
          value={form.categoryId}
          onChange={categoryId => setForm(f => ({ ...f, categoryId }))}
          options={ingredientCategories.map(c => ({ value: c.id, label: c.name, icon: c.icon }))}
        />
      </FormGroup>
      {ingredient && (
        <>
          {ingredient.usage > 0 && (
            <p className="-mt-3 mb-6 px-4 text-[13px] text-label-2">Used in {pluralize(ingredient.usage, 'meal')}.</p>
          )}
          <FormGroup>
            <button type="button" onClick={() => setConfirmDelete(true)} className="h-11 w-full text-[17px] text-red hover:bg-fill">Delete Item</button>
          </FormGroup>
          <ActionSheet
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title={`Delete “${ingredient.name}”?`}
            message={ingredient.usage > 0 ? `It will also be removed from ${pluralize(ingredient.usage, 'meal')}.` : undefined}
            actions={[{ label: 'Delete Item', destructive: true, onClick: onDelete }]}
          />
        </>
      )}
    </Sheet>
  )
}

export default function PantryTab({ kitchen, showUndo }) {
  const { pantryItems, ingredientCategories } = kitchen
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [aisle, setAisle] = useState('all')
  const [editing, setEditing] = useState(null) // { ingredient } — null ingredient means new
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())

  const inCount = pantryItems.filter(i => i.inStock).length
  const outCount = pantryItems.length - inCount

  const matchesStock = (item) => filter === 'all' || (filter === 'in' ? item.inStock : !item.inStock)
  const aisleOf = (item) => item.category ? item.ingredient_category_id : 'none'

  const aisleCounts = new Map()
  pantryItems.filter(matchesStock).forEach(item => aisleCounts.set(aisleOf(item), (aisleCounts.get(aisleOf(item)) || 0) + 1))
  const aisleChips = ingredientCategories.filter(c => aisleCounts.has(c.id) || c.id === aisle)

  const visible = pantryItems.filter(item =>
    normalizedName(item.name).includes(normalizedName(search))
    && matchesStock(item)
    && (aisle === 'all' || aisleOf(item) === aisle))

  const restock = visible.filter(i => !i.inStock && !i.onList)

  const groups = ingredientCategories
    .map(category => ({ category, items: visible.filter(i => i.ingredient_category_id === category.id) }))
    .concat([{ category: { id: 'none', name: 'Other', icon: '🛒' }, items: visible.filter(i => !i.category) }])
    .filter(group => group.items.length > 0)

  const toggleSelected = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const exitSelect = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const bulk = async (action) => {
    const ids = [...selected]
    if (action === 'list') await kitchen.addToList(ids)
    else await kitchen.setStock(ids, action === 'in')
    exitSelect()
  }

  const deleteIngredient = (ingredient) => {
    setEditing(null)
    const { undo, commit } = kitchen.deleteIngredient(ingredient)
    showUndo({ message: `Deleted “${ingredient.name}”`, undo, commit })
  }

  return (
    <>
      <PageHeader
        title="Pantry"
        subtitle={pantryItems.length ? `${inCount} of ${pluralize(pantryItems.length, 'item')} in stock` : 'What you have at home'}
      >
        {pantryItems.length > 0 && (
          <TextButton onClick={selecting ? exitSelect : () => setSelecting(true)} className={selecting ? 'font-semibold' : ''}>
            {selecting ? 'Done' : 'Select'}
          </TextButton>
        )}
        {!selecting && <AddButton label="Add Item" onClick={() => setEditing({ ingredient: null })} />}
      </PageHeader>

      {pantryItems.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Your pantry is empty"
          message="Add what you keep at home. Ingredients from your meals show up here too."
          action={<Button size="md" onClick={() => setEditing({ ingredient: null })}>Add an Item</Button>}
        />
      ) : (
        <>
          <div className="mb-3"><SearchField value={search} onChange={setSearch} placeholder="Search pantry" /></div>
          <Segmented
            className="mb-3"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: pantryItems.length },
              { value: 'in', label: 'In Stock', count: inCount },
              { value: 'out', label: 'Out', count: outCount },
            ]}
          />

          <div className="mb-6">
            <ChipRow>
              <Chip active={aisle === 'all'} onClick={() => setAisle('all')}>All aisles</Chip>
              {aisleChips.map(c => (
                <Chip key={c.id} active={aisle === c.id} onClick={() => setAisle(c.id)} count={aisleCounts.get(c.id)}>
                  {c.icon} {c.name}
                </Chip>
              ))}
            </ChipRow>
          </div>

          {filter === 'out' && restock.length > 0 && !selecting && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-[12px] bg-surface p-4 shadow-card">
              <div className="min-w-0">
                <p className="text-[17px] font-semibold text-label">Restock</p>
                <p className="text-[13px] text-label-2">{pluralize(restock.length, 'item')} not on your grocery list yet</p>
              </div>
              <Button size="md" onClick={() => kitchen.addToList(restock.map(i => i.id))}>
                <ShoppingBag size={16} /> Add All
              </Button>
            </div>
          )}

          {selecting && (
            <div className="mb-3 flex items-center justify-between px-4 text-[15px]">
              <span className="text-label-2">{selected.size} selected</span>
              <TextButton onClick={() => setSelected(new Set(visible.map(i => i.id)))} className="text-[15px]">Select All</TextButton>
            </div>
          )}

          {groups.map(({ category, items }) => (
            <Section key={category.id} title={`${category.icon} ${category.name}`}>
              {items.map(item => (
                <Row
                  key={item.id}
                  onClick={selecting ? () => toggleSelected(item.id) : () => setEditing({ ingredient: item })}
                  leading={selecting
                    ? <CheckCircle checked={selected.has(item.id)} color="tint" onClick={() => toggleSelected(item.id)} label={`Select ${item.name}`} />
                    : <CheckCircle checked={item.inStock} onClick={() => kitchen.setStock([item.id], !item.inStock)} label={`${item.name} in stock`} />}
                  title={item.name}
                  titleClassName={item.inStock ? '' : 'text-label-2'}
                  subtitle={item.usage ? `Used in ${pluralize(item.usage, 'meal')}` : null}
                  trailing={!selecting && (item.onList
                    ? <Pill color="tint">On list</Pill>
                    : !item.inStock && (
                      <Button size="sm" variant="tinted" onClick={() => kitchen.addToList([item.id])}>
                        <ShoppingBag size={13} strokeWidth={2.4} /> Add
                      </Button>
                    ))}
                />
              ))}
            </Section>
          ))}

          {visible.length === 0 && (
            <EmptyState
              title={search ? 'No results' : filter === 'in' ? 'Nothing in stock' : 'Fully stocked'}
              message={search ? 'Try a different search.' : filter === 'out' ? 'Everything in your pantry is in stock.' : undefined}
            />
          )}
        </>
      )}

      {selecting && (
        <div className="fixed inset-x-0 z-40 px-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-6 md:left-64">
          <div className="glass mx-auto flex max-w-md items-center justify-around gap-1 rounded-[18px] p-1.5 shadow-float">
            {[
              { action: 'in', label: 'In Stock' },
              { action: 'out', label: 'Out of Stock' },
              { action: 'list', label: 'Add to List' },
            ].map(({ action, label }) => (
              <button
                key={action}
                type="button"
                disabled={selected.size === 0}
                onClick={() => bulk(action)}
                className="h-10 flex-1 rounded-[12px] text-[15px] font-semibold text-tint transition-colors hover:bg-fill disabled:text-label-3"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <IngredientEditor
          kitchen={kitchen}
          ingredient={editing.ingredient}
          onClose={() => setEditing(null)}
          onDelete={() => deleteIngredient(editing.ingredient)}
        />
      )}
    </>
  )
}
