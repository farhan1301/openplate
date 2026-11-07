import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { byName, normalizedName } from './kitchen'

const ok = (result) => {
  if (result.error) throw result.error
  return result.data
}

const isTemp = (id) => String(id).startsWith('temp-')
const tempId = () => `temp-${Math.random().toString(36).slice(2)}`

/**
 * Single source of truth for the whole app. Everything is loaded once and
 * shared between tabs, so a change made in one tab is instantly reflected
 * in the others.
 *
 * Every mutation follows the same shape: patch local state optimistically,
 * write to Supabase, then refresh. Refreshes are versioned so a slow,
 * older response can never overwrite newer state.
 */
export function useKitchen({ notify } = {}) {
  const [data, setData] = useState({
    ingredientCategories: [],
    mealCategories: [],
    ingredients: [],
    pantry: {},
    cart: [],
    meals: [],
    favorites: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favoritesReady, setFavoritesReady] = useState(true)
  const [hidden, setHidden] = useState(() => new Set())
  const requestRef = useRef(0)
  const notifyRef = useRef(notify)
  notifyRef.current = notify

  const refresh = useCallback(async () => {
    const request = ++requestRef.current
    try {
      const [ingredientCategories, mealCategories, ingredients, pantryRows, cart, meals, favoritesRes] = await Promise.all([
        supabase.from('ingredient_categories').select('*').order('sort_order').then(ok),
        supabase.from('meal_categories').select('*').order('name').then(ok),
        supabase.from('ingredients').select('id, name, ingredient_category_id').order('name').then(ok),
        supabase.from('pantry').select('ingredient_id, in_stock').then(ok),
        supabase.from('shopping_cart').select('*').order('added_at').then(ok),
        supabase
          .from('meals')
          .select('id, name, description, meal_category_id, prep_time_minutes, image_url, calories, protein, carbs, fat, fiber, meal_ingredients(id, ingredient_id, quantity, optional)')
          .order('name')
          .then(ok),
        supabase.from('favorites').select('*').order('created_at', { ascending: false }),
      ])

      if (request !== requestRef.current) return

      const pantry = {}
      pantryRows.forEach(row => { pantry[row.ingredient_id] = row.in_stock })

      setFavoritesReady(!favoritesRes.error)
      setData({
        ingredientCategories,
        mealCategories,
        ingredients,
        pantry,
        cart,
        meals,
        favorites: favoritesRes.data || [],
      })
      setError('')
    } catch (err) {
      if (request !== requestRef.current) return
      console.error('Failed to load kitchen data:', err)
      setError(err.message || 'Could not load your kitchen.')
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // Pick up changes made on another device (or another tab) when coming back to the app.
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refresh])

  const patch = useCallback((updater) => setData(prev => ({ ...prev, ...updater(prev) })), [])

  const mutate = useCallback(async (optimistic, write) => {
    if (optimistic) patch(optimistic)
    try {
      await write()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      await refresh()
    }
  }, [patch, refresh])

  // ---------- derived ----------

  const derived = useMemo(() => {
    const categoriesById = new Map(data.ingredientCategories.map(c => [c.id, c]))
    const ingredients = data.ingredients
      .filter(i => !hidden.has(i.id))
      .map(i => ({ ...i, category: categoriesById.get(i.ingredient_category_id) || null }))
    const ingredientsById = new Map(ingredients.map(i => [i.id, i]))

    const inStock = new Set(Object.entries(data.pantry).filter(([, v]) => v).map(([k]) => k))
    const cart = data.cart.filter(row => ingredientsById.has(row.ingredient_id))
    const onList = new Set(cart.filter(row => !row.checked).map(row => row.ingredient_id))

    const meals = data.meals
      .filter(m => !hidden.has(m.id))
      .map(m => ({
        ...m,
        meal_ingredients: (m.meal_ingredients || []).filter(link => ingredientsById.has(link.ingredient_id)),
      }))
    const mealsById = new Map(meals.map(m => [m.id, m]))

    const usage = {}
    meals.forEach(m => m.meal_ingredients.forEach(link => {
      usage[link.ingredient_id] = (usage[link.ingredient_id] || 0) + 1
    }))

    const pantryItems = ingredients
      .filter(i => Object.prototype.hasOwnProperty.call(data.pantry, i.id))
      .map(i => ({ ...i, inStock: Boolean(data.pantry[i.id]), onList: onList.has(i.id), usage: usage[i.id] || 0 }))
      .sort(byName)

    const favorites = data.favorites.filter(f => !hidden.has(f.id))

    return { categoriesById, ingredients, ingredientsById, inStock, onList, cart, meals, mealsById, usage, pantryItems, favorites }
  }, [data, hidden])

  const hide = (id) => setHidden(prev => new Set(prev).add(id))
  const unhide = (id) => setHidden(prev => {
    const next = new Set(prev)
    next.delete(id)
    return next
  })

  // ---------- ingredients ----------

  const ensureIngredient = useCallback(async (name, categoryId) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Ingredient name is required.')

    const existing = data.ingredients.find(i => normalizedName(i.name) === normalizedName(trimmed))
    if (existing) {
      if (!existing.ingredient_category_id && categoryId) {
        ok(await supabase.from('ingredients').update({ ingredient_category_id: categoryId }).eq('id', existing.id))
      }
      return existing
    }

    const inserted = await supabase
      .from('ingredients')
      .insert({ name: trimmed, ingredient_category_id: categoryId || null })
      .select('id, name, ingredient_category_id')
      .single()

    if (inserted.error) {
      const duplicate = inserted.error.code === '23505'
      if (!duplicate) throw inserted.error
      return ok(await supabase.from('ingredients').select('id, name, ingredient_category_id').eq('name', trimmed).single())
    }
    return inserted.data
  }, [data.ingredients])

  const saveIngredient = useCallback(async ({ id, name, categoryId, inStock }) => {
    try {
      let ingredientId = id
      if (id) {
        ok(await supabase.from('ingredients').update({ name: name.trim(), ingredient_category_id: categoryId || null }).eq('id', id))
      } else {
        ingredientId = (await ensureIngredient(name, categoryId)).id
      }
      ok(await supabase.from('pantry').upsert({ ingredient_id: ingredientId, in_stock: inStock }, { onConflict: 'ingredient_id' }))
    } finally {
      await refresh()
    }
  }, [ensureIngredient, refresh])

  const restoreRows = useCallback((rows) => mutate(
    prev => ({ cart: [...prev.cart, ...rows] }),
    async () => {
      ok(await supabase.from('shopping_cart').upsert(
        rows.map(({ id, ingredient_id, meal_id, checked, added_at }) => ({ id, ingredient_id, meal_id, checked, added_at })),
        { onConflict: 'id' },
      ))
    },
  ), [mutate])

  /**
   * Marks ingredients in or out of stock and keeps the grocery list in step:
   * something now in stock no longer needs buying, and a "picked up" entry
   * for something that has run out is stale.
   */
  const setStock = useCallback(async (ids, inStock) => {
    const idSet = new Set(ids)
    const stale = data.cart.filter(r => idSet.has(r.ingredient_id) && !isTemp(r.id) && r.checked !== inStock)
    const staleIds = new Set(stale.map(r => r.id))

    await mutate(
      prev => {
        const pantry = { ...prev.pantry }
        ids.forEach(id => { pantry[id] = inStock })
        return { pantry, cart: prev.cart.filter(r => !staleIds.has(r.id)) }
      },
      async () => {
        ok(await supabase.from('pantry').upsert(ids.map(id => ({ ingredient_id: id, in_stock: inStock })), { onConflict: 'ingredient_id' }))
        if (stale.length) ok(await supabase.from('shopping_cart').delete().in('id', [...staleIds]))
      },
    )

    const removedFromList = stale.filter(r => !r.checked)
    if (inStock && removedFromList.length && notifyRef.current) {
      const names = [...new Set(removedFromList.map(r => data.ingredients.find(i => i.id === r.ingredient_id)?.name).filter(Boolean))]
      notifyRef.current({
        message: names.length === 1 ? `${names[0]} in stock · removed from list` : `${names.length} in-stock items removed from list`,
        undo: () => restoreRows(removedFromList),
      })
    }
  }, [data.cart, data.ingredients, mutate, restoreRows])

  const deleteIngredient = useCallback((ingredient) => {
    hide(ingredient.id)
    return {
      undo: () => unhide(ingredient.id),
      commit: async () => {
        try {
          ok(await supabase.from('ingredients').delete().eq('id', ingredient.id))
        } catch (err) {
          setError(err.message)
        }
        await refresh()
        unhide(ingredient.id)
      },
    }
  }, [refresh])

  // ---------- grocery list ----------

  const addToList = useCallback((ingredientIds, mealId = null) => {
    const onList = new Set(data.cart.filter(r => !r.checked).map(r => r.ingredient_id))
    const ids = [...new Set(ingredientIds)].filter(id => !onList.has(id))
    if (ids.length === 0) return Promise.resolve()

    return mutate(
      prev => ({
        cart: [
          ...prev.cart.filter(r => !(ids.includes(r.ingredient_id) && r.meal_id === mealId)),
          ...ids.map(id => ({ id: tempId(), ingredient_id: id, meal_id: mealId, checked: false, added_at: new Date().toISOString() })),
        ],
      }),
      async () => {
        ok(await supabase.from('shopping_cart').upsert(
          ids.map(id => ({ ingredient_id: id, meal_id: mealId, checked: false })),
          { onConflict: 'ingredient_id,meal_id' },
        ))
      },
    )
  }, [data.cart, mutate])

  const quickAddToList = useCallback(async (name, categoryId) => {
    try {
      const ingredient = await ensureIngredient(name, categoryId)
      ok(await supabase.from('shopping_cart').upsert(
        { ingredient_id: ingredient.id, meal_id: null, checked: false },
        { onConflict: 'ingredient_id,meal_id' },
      ))
    } catch (err) {
      setError(err.message)
    } finally {
      await refresh()
    }
  }, [ensureIngredient, refresh])

  /** Checks or un-checks every list row for one ingredient. */
  const setPickedUp = useCallback((rows, checked) => {
    const saved = rows.filter(r => !isTemp(r.id))
    if (saved.length === 0) return Promise.resolve()
    const ids = new Set(saved.map(r => r.id))
    const ingredientId = saved[0].ingredient_id
    return mutate(
      prev => ({
        cart: prev.cart.map(r => ids.has(r.id) ? { ...r, checked } : r),
        pantry: { ...prev.pantry, [ingredientId]: checked },
      }),
      async () => {
        ok(await supabase.from('shopping_cart').update({ checked }).in('id', [...ids]))
        // Picking an item up means it's now in the pantry; un-checking it puts it back to "needed".
        ok(await supabase.from('pantry').upsert({ ingredient_id: ingredientId, in_stock: checked }, { onConflict: 'ingredient_id' }))
      },
    )
  }, [mutate])

  /**
   * Removes rows right away and returns an undo that restores them. Deleting
   * immediately (instead of after the undo timeout) means the list can never
   * "come back" from a refresh or a tab switch.
   */
  const removeFromList = useCallback(async (rows) => {
    const removed = rows.filter(r => !isTemp(r.id))
    const ids = new Set(rows.map(r => r.id))
    await mutate(
      prev => ({ cart: prev.cart.filter(r => !ids.has(r.id)) }),
      async () => {
        if (removed.length) ok(await supabase.from('shopping_cart').delete().in('id', removed.map(r => r.id)))
      },
    )
    return () => restoreRows(removed)
  }, [mutate, restoreRows])

  // ---------- meals ----------

  const saveMeal = useCallback(async ({ id, name, categoryId, prepTime, description, imageUrl, nutrition, items, removedLinkIds }) => {
    try {
      const fields = {
        name: name.trim(),
        meal_category_id: categoryId || null,
        prep_time_minutes: prepTime ? parseInt(prepTime, 10) : null,
        description: description.trim() || null,
        image_url: imageUrl?.trim() || null,
        ...nutrition,
      }

      let mealId = id
      if (id) {
        ok(await supabase.from('meals').update(fields).eq('id', id))
      } else {
        mealId = ok(await supabase.from('meals').insert(fields).select('id').single()).id
      }

      if (removedLinkIds.length) {
        const removedIngredientIds = (data.meals.find(m => m.id === id)?.meal_ingredients || [])
          .filter(link => removedLinkIds.includes(link.id))
          .map(link => link.ingredient_id)
        ok(await supabase.from('meal_ingredients').delete().in('id', removedLinkIds))
        // Items still on the grocery list only for this meal aren't needed any more.
        if (removedIngredientIds.length) {
          ok(await supabase.from('shopping_cart').delete().eq('meal_id', id).eq('checked', false).in('ingredient_id', removedIngredientIds))
        }
      }

      for (const item of items) {
        if (item.linkId) {
          ok(await supabase.from('meal_ingredients').update({ optional: item.optional }).eq('id', item.linkId))
          continue
        }

        const ingredient = item.ingredient_id
          ? { id: item.ingredient_id }
          : await ensureIngredient(item.name, item.categoryId)

        // New ingredients join the pantry (as "out") so they can be tracked later.
        if (!Object.prototype.hasOwnProperty.call(data.pantry, ingredient.id)) {
          ok(await supabase.from('pantry').upsert({ ingredient_id: ingredient.id, in_stock: false }, { onConflict: 'ingredient_id', ignoreDuplicates: true }))
        }

        ok(await supabase.from('meal_ingredients').upsert(
          { meal_id: mealId, ingredient_id: ingredient.id, optional: item.optional },
          { onConflict: 'meal_id,ingredient_id' },
        ))
      }
      return mealId
    } finally {
      await refresh()
    }
  }, [data.meals, data.pantry, ensureIngredient, refresh])

  const deleteMeal = useCallback((meal) => {
    hide(meal.id)
    return {
      undo: () => unhide(meal.id),
      commit: async () => {
        try {
          ok(await supabase.from('shopping_cart').delete().eq('meal_id', meal.id).eq('checked', false))
          ok(await supabase.from('meals').delete().eq('id', meal.id))
        } catch (err) {
          setError(err.message)
        }
        await refresh()
        unhide(meal.id)
      },
    }
  }, [refresh])

  // ---------- favorites ----------

  const saveFavorite = useCallback(async (favorite) => {
    const { id, ...fields } = favorite
    try {
      if (id) ok(await supabase.from('favorites').update(fields).eq('id', id))
      else ok(await supabase.from('favorites').insert(fields))
    } finally {
      await refresh()
    }
  }, [refresh])

  const deleteFavorite = useCallback(async (favorite) => {
    await mutate(
      prev => ({ favorites: prev.favorites.filter(f => f.id !== favorite.id) }),
      async () => { ok(await supabase.from('favorites').delete().eq('id', favorite.id)) },
    )
    return () => mutate(
      prev => ({ favorites: [favorite, ...prev.favorites] }),
      async () => { ok(await supabase.from('favorites').insert(favorite)) },
    )
  }, [mutate])

  const toggleMealFavorite = useCallback((meal) => {
    const existing = data.favorites.find(f => f.meal_id === meal.id)
    if (existing) return deleteFavorite(existing)
    return saveFavorite({ kind: 'dish', name: meal.name, meal_id: meal.id, place: 'Home' })
  }, [data.favorites, deleteFavorite, saveFavorite])

  return {
    ...derived,
    ingredientCategories: data.ingredientCategories,
    mealCategories: data.mealCategories,
    favoritesReady,
    loading,
    error,
    clearError: () => setError(''),
    refresh,
    setStock,
    saveIngredient,
    deleteIngredient,
    addToList,
    quickAddToList,
    setPickedUp,
    removeFromList,
    saveMeal,
    deleteMeal,
    saveFavorite,
    deleteFavorite,
    toggleMealFavorite,
  }
}
