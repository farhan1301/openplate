import { useState } from 'react'
import { Dumbbell, Flame, Heart, House, Package, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { useKitchen } from './lib/useKitchen'
import { useUndo } from './lib/useUndo'
import HomeTab from './components/HomeTab'
import MealsTab from './components/MealsTab'
import PantryTab from './components/PantryTab'
import GroceriesTab from './components/GroceriesTab'
import FavoritesTab from './components/FavoritesTab'
import NutritionTab from './components/NutritionTab'
import FitnessTab from './components/FitnessTab'
import UndoToast from './components/UndoToast'
import { AccountSheet, Avatar, LoadingScreen, NoAccessScreen, SignInScreen } from './components/Auth'
import { useAuth } from './lib/useAuth'
import { ErrorBanner } from './components/ui'
import { cx } from './lib/cx'

const TABS = [
  { id: 'home', label: 'Home', icon: House, component: HomeTab },
  { id: 'meals', label: 'Meals', icon: UtensilsCrossed, component: MealsTab },
  { id: 'pantry', label: 'Pantry', icon: Package, component: PantryTab },
  { id: 'groceries', label: 'Groceries', icon: ShoppingBag, component: GroceriesTab },
  { id: 'favorites', label: 'Favorites', icon: Heart, component: FavoritesTab },
  { id: 'nutrition', label: 'Nutrition', icon: Flame, component: NutritionTab },
  { id: 'fitness', label: 'Fitness', icon: Dumbbell, component: FitnessTab },
]

function Skeleton() {
  return (
    <div className="animate-pulse pt-2 md:pt-10">
      <div className="mb-2 h-9 w-40 rounded-lg bg-fill" />
      <div className="mb-8 h-4 w-56 rounded bg-fill" />
      <div className="mb-6 h-9 rounded-[10px] bg-fill" />
      {[0, 1].map(i => (
        <div key={i} className="mb-7 space-y-px overflow-hidden rounded-[12px]">
          {[0, 1, 2, 3].map(j => <div key={j} className="h-14 bg-surface" />)}
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const auth = useAuth()

  if (auth.status === 'loading' || auth.status === 'checking') return <LoadingScreen />
  if (auth.status === 'signed-out') return <SignInScreen />
  if (auth.status === 'denied') return <NoAccessScreen email={auth.session?.user?.email} onSignOut={auth.signOut} />
  return <Kitchen user={auth.session.user} onSignOut={auth.signOut} />
}

function Kitchen({ user, onSignOut }) {
  const undo = useUndo()
  const kitchen = useKitchen({ notify: undo.show })
  // Always open on Home: the at-a-glance view of what you can cook.
  const [tab, setTab] = useState('home')
  const [accountOpen, setAccountOpen] = useState(false)

  const selectTab = (id) => {
    setTab(id)
    window.scrollTo({ top: 0 })
  }

  const badges = {
    groceries: kitchen.onList.size || null,
  }

  const Active = TABS.find(t => t.id === tab).component

  return (
    <div className="min-h-screen bg-canvas text-label">
      {/* iPad / desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-separator bg-surface/60 px-3 pt-8 backdrop-blur-xl md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-orange to-pink text-[18px] shadow-card">🍽</span>
          <div>
            <p className="text-[17px] font-semibold leading-tight">OpenPlate</p>
            <p className="text-[12px] text-label-2">Food, training &amp; body</p>
          </div>
        </div>
        <nav className="space-y-0.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={cx(
                'flex h-10 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium transition-colors',
                tab === id ? 'bg-tint text-white' : 'text-label hover:bg-fill',
              )}
            >
              <Icon size={19} strokeWidth={2.1} className={tab === id ? '' : 'text-tint'} />
              <span className="flex-1 text-left">{label}</span>
              {badges[id] && <span className={cx('text-[13px] tabular-nums', tab === id ? 'text-white/80' : 'text-label-2')}>{badges[id]}</span>}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setAccountOpen(true)}
          className="mb-4 mt-auto flex items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-fill"
        >
          <Avatar user={user} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-label">{user.user_metadata?.full_name || 'Account'}</span>
            <span className="block truncate text-[12px] text-label-2">{user.email}</span>
          </span>
        </button>
      </aside>

      <div className="md:pl-64">
        <main className="mx-auto max-w-3xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-8 md:pb-16">
          <div className="flex justify-end pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
            <button type="button" onClick={() => setAccountOpen(true)} aria-label="Account" className="rounded-full transition-opacity active:opacity-70">
              <Avatar user={user} />
            </button>
          </div>
          <ErrorBanner message={kitchen.error} onDismiss={kitchen.clearError} />
          {kitchen.loading ? <Skeleton /> : <Active kitchen={kitchen} showUndo={undo.show} user={user} onNavigate={selectTab} />}
        </main>
      </div>

      {/* iPhone tab bar */}
      <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-separator pb-safe md:hidden">
        <div className="mx-auto flex max-w-md">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cx('relative flex h-[50px] flex-1 flex-col items-center justify-center gap-0.5 transition-colors', tab === id ? 'text-tint' : 'text-label-2')}
            >
              <span className="relative">
                <Icon size={24} strokeWidth={tab === id ? 2.3 : 1.8} />
                {id === 'groceries' && badges.groceries && (
                  <span className="absolute -right-2.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[11px] font-semibold text-white">
                    {badges.groceries}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>

      <UndoToast message={undo.message} onUndo={undo.undo} />
      {accountOpen && <AccountSheet user={user} onClose={() => setAccountOpen(false)} onSignOut={onSignOut} />}
    </div>
  )
}
