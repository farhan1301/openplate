import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Copy, Download, KeyRound } from 'lucide-react'
import builtInGuide from '../../docs/MEALS_AGENT.md?raw'
import { createAgentKey, fetchAboutMe, fetchKitchenGuide, fetchKitchenSnapshot, listAgentActions, listAgentKeys, resetKitchenGuide, revokeAgentKey, saveAboutMe, setAgentKeyWrite } from '../lib/agentAccess'
import { Button, ErrorBanner, FormGroup, Row, Section, Segmented, Sheet, TextArea, TextButton, TextInput } from './ui'
import GuideEditor from './GuideEditor'

const mcpUrl = (key) => `${window.location.origin}/api/mcp?key=${key}`

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** One Markdown document: the guide, then the snapshot. Paste or attach it anywhere. */
const buildBriefing = (snapshot, kitchenGuide) => [
  '# Me: food, training and body. Briefing for an AI assistant',
  '',
  `Below are (1) a guide that explains my data and how to help me, and (2) a snapshot as of ${snapshot.as_of}: my profile ("about_me"), meals, pantry, grocery list, favorites, nutrition (goals, today's food log, the last 7 days) fitness (gym-day goal, workout plan, this week, the last 14 days, body weight) and supplements (what I take, how much and when, with notes, and what I've taken today). Read the guide first, then use the snapshot to answer my questions and coach me. Ignore the guide's section on connecting to the data: everything you need is in this message.`,
  '',
  '---',
  '',
  kitchenGuide.trim(),
  '',
  '---',
  '',
  `# Snapshot (${snapshot.as_of})`,
  '',
  '```json',
  JSON.stringify(snapshot, null, 2),
  '```',
  '',
].join('\n')

const download = (text, filename) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : null)

const formatWhen = (value) => new Date(value).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const ACTION_LABELS = {
  set_stock: 'Stock',
  add_ingredient: 'Added ingredient',
  update_ingredient: 'Edited ingredient',
  delete_ingredient: 'Deleted ingredient',
  add_to_grocery_list: 'Added to list',
  add_meal_to_grocery_list: 'Shopping for meal',
  mark_picked_up: 'Picked up',
  remove_from_grocery_list: 'Removed from list',
  create_meal: 'New meal',
  update_meal: 'Edited meal',
  delete_meal: 'Deleted meal',
  add_favorite: 'New favorite',
  update_favorite: 'Edited favorite',
  delete_favorite: 'Deleted favorite',
  update_kitchen_guide: 'Edited guide',
  log_food: 'Logged food',
  update_food_log: 'Edited log entry',
  delete_food_log: 'Deleted log entry',
  set_nutrition_goals: 'Changed goals',
  set_meal_nutrition: 'Meal nutrition',
  log_workout: 'Logged workout',
  update_workout: 'Edited workout',
  delete_workout: 'Deleted workout',
  set_fitness_goals: 'Training goals',
  save_routine: 'Workout plan',
  delete_routine: 'Deleted routine',
  log_body: 'Weigh-in',
  delete_body_log: 'Deleted weigh-in',
  save_supplement: 'Supplement',
  delete_supplement: 'Removed supplement',
  log_supplement: 'Supplements taken',
  update_about_me: 'Edited About me',
}

const ACCESS_OPTIONS = [
  { value: 'read', label: 'Read-only' },
  { value: 'write', label: 'Can make changes' },
]

const list = (items) => (items || []).join(', ')

/** One line describing what an agent changed, from the action's stored result. */
const describeAction = ({ action, result = {} }) => {
  switch (action) {
    case 'set_stock': return `${list(result.ingredients)} ${result.in_stock ? 'in stock' : 'out of stock'}`
    case 'mark_picked_up': return `${list(result.ingredients)}${result.picked_up ? '' : ' (un-checked)'}`
    case 'add_ingredient': return result.ingredient
    case 'update_ingredient': return `${result.before?.name} → ${result.after?.name}${result.after?.aisle ? ` · ${result.after.aisle}` : ''}`
    case 'delete_ingredient': return result.deleted
    case 'add_to_grocery_list': return list(result.added) || 'nothing new'
    case 'add_meal_to_grocery_list': return `${result.meal}: ${list(result.added) || 'nothing missing'}`
    case 'remove_from_grocery_list': return result.cleared ? `cleared ${result.cleared === 'all' ? 'everything' : 'picked up'}` : list(result.removed)
    case 'create_meal':
    case 'update_meal': return result.meal?.name
    case 'delete_meal': return result.deleted?.name
    case 'add_favorite':
    case 'update_favorite': return result.favorite?.name
    case 'delete_favorite': return result.deleted?.name
    case 'update_kitchen_guide': return result.customized ? `${result.characters} characters` : 'back to built-in'
    case 'log_food': return result.logged && `${result.logged.name} · ${Math.round(result.logged.calories)} kcal`
    case 'update_food_log': return result.updated?.name
    case 'delete_food_log': return result.deleted?.name
    case 'set_nutrition_goals': return result.goals && ['calories', 'protein', 'carbs', 'fat', 'fiber'].filter(k => result.goals[k]).map(k => `${k} ${result.goals[k]}`).join(', ')
    case 'set_meal_nutrition': return result.meal && `${result.meal.name} · ${result.meal.per_serving?.calories ?? '?'} kcal`
    case 'log_workout': return result.logged && [result.logged.title, result.logged.status !== 'done' ? result.logged.status : null, result.logged.date].filter(Boolean).join(' · ')
    case 'update_workout': return result.updated?.title
    case 'delete_workout': return result.deleted?.title
    case 'set_fitness_goals': return result.goals && [result.goals.days_per_week && `${result.goals.days_per_week} days/week`, (result.goals.gym_days || []).join(' ')].filter(Boolean).join(' · ')
    case 'save_routine': return (result.created || result.updated)?.name
    case 'delete_routine': return result.deleted?.name
    case 'log_body': return result.logged && [result.logged.weight && `${result.logged.weight}`, result.logged.body_fat && `${result.logged.body_fat}%`].filter(Boolean).join(' · ')
    case 'delete_body_log': return result.deleted?.date
    case 'save_supplement': {
      const s = result.created || result.updated
      return s && [s.name, s.dose, s.status !== 'taking' ? s.status : null].filter(Boolean).join(' · ')
    }
    case 'delete_supplement': return result.deleted?.name
    case 'log_supplement': return result.changed && `${list(result.changed.map(c => c.supplement))}${result.changed.some(c => !c.taken) ? ' (un-ticked)' : ''}`
    case 'update_about_me': return `${result.characters} characters`
    default: return ''
  }
}

/**
 * Everything for connecting AI agents: "about me" notes they read first, a
 * one-shot guide + snapshot to paste into any chat, and read-only keys for
 * live connectors (MCP / URL).
 */
export default function AgentAccessSheet({ onClose }) {
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  const [aboutMe, setAboutMe] = useState('')
  const [savedAboutMe, setSavedAboutMe] = useState('')
  const [savingAbout, setSavingAbout] = useState(false)

  const [busy, setBusy] = useState('')

  const [keys, setKeys] = useState([])
  const [label, setLabel] = useState('')
  const [canWrite, setCanWrite] = useState(false)
  const [newKey, setNewKey] = useState(null)
  const [actions, setActions] = useState([])
  // null until loaded (or if the guide table isn't set up yet): use the built-in guide.
  const [guide, setGuide] = useState(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const kitchenGuide = guide?.content ?? builtInGuide

  const fail = (err) => setError(err.message || 'Something went wrong.')

  const loadKeys = useCallback(() => Promise.all([listAgentKeys(), listAgentActions(20)])
    .then(([keyRows, actionRows]) => { setKeys(keyRows); setActions(actionRows) })
    .catch(fail), [])

  const loadGuide = useCallback(() => fetchKitchenGuide().then(setGuide).catch(() => setGuide(null)), [])

  useEffect(() => {
    fetchAboutMe().then(text => { setAboutMe(text); setSavedAboutMe(text) }).catch(fail)
    loadKeys()
    loadGuide()
  }, [loadKeys, loadGuide])

  const say = (message) => { setStatus(message); setError('') }

  const storeAboutMe = async () => {
    setSavingAbout(true)
    try {
      await saveAboutMe(aboutMe.trim())
      setSavedAboutMe(aboutMe.trim())
      say('Saved. Agents see it in every snapshot.')
    } catch (err) {
      fail(err)
    } finally {
      setSavingAbout(false)
    }
  }

  const share = (mode) => async () => {
    setBusy(mode)
    try {
      const snapshot = await fetchKitchenSnapshot()
      if (mode === 'download') {
        download(buildBriefing(snapshot, kitchenGuide), `kitchen-${snapshot.as_of}.md`)
        say('Downloaded. Attach the file to any AI chat.')
      } else {
        const text = mode === 'json' ? JSON.stringify(snapshot, null, 2) : buildBriefing(snapshot, kitchenGuide)
        say((await copyText(text))
          ? `${mode === 'json' ? 'Snapshot JSON' : 'Guide + snapshot'} copied. Paste it into any AI chat.`
          : 'Copy failed: your browser blocked clipboard access. Use Download instead.')
      }
    } catch (err) {
      fail(err)
    } finally {
      setBusy('')
    }
  }

  const resetGuide = async () => {
    if (!window.confirm('Replace the edited guide with the built-in one? The edited text is lost unless you copy it first (Open guide → Copy).')) return
    try {
      await resetKitchenGuide()
      await loadGuide()
      say('Guide reset. Agents read the built-in guide again.')
    } catch (err) {
      fail(err)
    }
  }

  const addKey = async () => {
    setBusy('key')
    try {
      setNewKey(await createAgentKey(label.trim(), canWrite))
      setLabel('')
      setCanWrite(false)
      setStatus('')
      await loadKeys()
    } catch (err) {
      fail(err)
    } finally {
      setBusy('')
    }
  }

  const revoke = async (key) => {
    if (!window.confirm(`Revoke "${key.label}"? Agents using it lose access immediately.`)) return
    const id = key.id
    try {
      await revokeAgentKey(id)
      if (newKey?.id === id) setNewKey(null)
      await loadKeys()
    } catch (err) {
      fail(err)
    }
  }

  const toggleWrite = async (key) => {
    if (!key.can_write && !window.confirm(`Let "${key.label}" change your pantry, grocery list, meals and favorites? You can turn this off any time.`)) return
    try {
      await setAgentKeyWrite(key.id, !key.can_write)
      await loadKeys()
    } catch (err) {
      fail(err)
    }
  }

  const copy = (text, what) => async () => {
    say((await copyText(text)) ? `${what} copied.` : 'Copy failed: your browser blocked clipboard access.')
  }

  const activeKeys = keys.filter(k => !k.revoked_at)

  return (
    <>
    {/* The guide opens in place of this sheet, so Escape and the scrim only close one at a time. */}
    <Sheet open={!guideOpen} onClose={onClose} title="AI Access">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <p className="mb-6 px-1 text-[15px] text-label-2">
        Let any AI assistant answer questions like “what can I cook tonight?”, “what should I do at the gym today?” or
        “how am I doing this week?” from your live meals, pantry, grocery list, favorites, food log and workouts. Keys
        are read-only unless you let them make changes, like “I just bought eggs”, “log two eggs on toast for
        breakfast”, “I did push day” or “build me a 4-day plan”.
      </p>

      <FormGroup
        title="About me"
        footer="Agents read this first, and agents that can make changes keep it up to date when you tell them something about yourself. Body (age, height, weight), goals, diet, allergies, injuries, training, who you cook for, likes and dislikes, how much time you have."
      >
        <TextArea value={aboutMe} onChange={setAboutMe} rows={6} placeholder="e.g. 35, 170 cm, 72 kg. Goal: lose fat, keep muscle. Vegetarian, no mushrooms, love spicy food. Gym 4×/week after work; bad left knee. Cooking for two, weeknights 30 minutes max." />
      </FormGroup>
      {aboutMe.trim() !== savedAboutMe && (
        <div className="-mt-4 mb-6 px-1">
          <Button size="md" onClick={storeAboutMe} disabled={savingAbout}>{savingAbout ? 'Saving…' : 'Save'}</Button>
        </div>
      )}

      <Section
        title="Agent guide"
        footer="What every agent reads first: how your data works, the rules and how to coach you. Open it to read the whole thing or edit it."
      >
        <Row
          onClick={() => setGuideOpen(true)}
          leading={<span className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-tint/14 text-tint"><BookOpen size={17} /></span>}
          title="Open guide"
          subtitle={guide?.customized
            ? `Edited${guide.updated_by ? ` by ${guide.updated_by}` : ''}${guide.updated_at ? ` on ${formatDate(guide.updated_at)}` : ''} · ${kitchenGuide.split('\n').length} lines`
            : `Built-in guide · ${kitchenGuide.split('\n').length} lines`}
          chevron
        />
        {guide?.customized && (
          <div className="flex items-center gap-3 border-t border-separator px-4 py-3">
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-label-2">Agents read the edited copy, not the built-in guide that ships with the app.</p>
            <TextButton tone="red" onClick={resetGuide}>Reset guide</TextButton>
          </div>
        )}
      </Section>

      <Section title="Share with any AI" footer="The guide plus a snapshot of everything, as one document. Works in any chat, no connector needed.">
        <div className="flex flex-wrap gap-2 p-3">
          <Button size="md" onClick={share('briefing')} disabled={Boolean(busy)}>
            <Copy size={15} /> {busy === 'briefing' ? 'Building…' : 'Copy guide + snapshot'}
          </Button>
          <Button size="md" variant="gray" onClick={share('download')} disabled={Boolean(busy)}>
            <Download size={15} /> Download .md
          </Button>
          <Button size="md" variant="gray" onClick={share('json')} disabled={Boolean(busy)}>Snapshot JSON</Button>
        </div>
      </Section>

      <FormGroup
        title="Connect an agent"
        footer="“Can make changes” lets the agent update your pantry, grocery list, meals and favorites, log food and workouts, set nutrition and training goals, build your workout plan, manage your supplements and keep About me current. Creates a key and a connector URL: add the URL as a custom connector (MCP) in Claude, ChatGPT, Gemini or any MCP client."
      >
        <TextInput value={label} onChange={setLabel} placeholder="Name, e.g. Claude" onKeyDown={e => { if (e.key === 'Enter' && label.trim()) addKey() }} />
        <div className="space-y-3 p-3">
          <Segmented options={ACCESS_OPTIONS} value={canWrite ? 'write' : 'read'} onChange={value => setCanWrite(value === 'write')} />
          <Button size="md" onClick={addKey} disabled={!label.trim() || busy === 'key'}>
            <KeyRound size={15} /> {busy === 'key' ? 'Creating…' : 'Create key'}
          </Button>
        </div>
      </FormGroup>

      {newKey && (
        <Section title={`New key: ${newKey.label}${newKey.can_write ? ' (can make changes)' : ' (read-only)'}`} footer="Copy it now: the key is shown only once. Revoke it below if it leaks.">
          <div className="space-y-3 p-4">
            <div>
              <p className="mb-1 text-[13px] text-label-2">Connector URL (MCP)</p>
              <p className="break-all rounded-[10px] bg-fill px-3 py-2 font-mono text-[13px] text-label">{mcpUrl(newKey.token)}</p>
            </div>
            <div>
              <p className="mb-1 text-[13px] text-label-2">Key</p>
              <p className="break-all rounded-[10px] bg-fill px-3 py-2 font-mono text-[13px] text-label">{newKey.token}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="md" onClick={copy(mcpUrl(newKey.token), 'Connector URL')}><Copy size={15} /> Copy connector URL</Button>
              <Button size="md" variant="gray" onClick={copy(newKey.token, 'Key')}>Copy key</Button>
            </div>
          </div>
        </Section>
      )}

      {keys.length > 0 && (
        <Section title="Keys" footer={`${activeKeys.length} active. Changing access takes effect on the agent's next request; revoked keys stop working immediately.`}>
          {keys.map(k => (k.revoked_at ? (
            <Row
              key={k.id}
              title={k.label}
              titleClassName="text-label-3 line-through"
              subtitle={`${k.token_prefix}… · created ${formatDate(k.created_at)} · revoked ${formatDate(k.revoked_at)}`}
            />
          ) : (
            <div key={k.id} className="border-b border-separator px-4 py-3 last:border-b-0">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] leading-snug text-label">{k.label}</p>
                  <p className="mt-0.5 truncate text-[13px] leading-snug text-label-2">
                    {`${k.token_prefix}… · created ${formatDate(k.created_at)} · ${k.last_used_at ? `last used ${formatDate(k.last_used_at)}` : 'never used'}`}
                  </p>
                </div>
                <TextButton tone="red" onClick={() => revoke(k)}>Revoke</TextButton>
              </div>
              <Segmented
                className="mt-2.5"
                options={ACCESS_OPTIONS}
                value={k.can_write ? 'write' : 'read'}
                onChange={value => { if ((value === 'write') !== k.can_write) toggleWrite(k) }}
              />
            </div>
          )))}
        </Section>
      )}

      {actions.length > 0 && (
        <Section title="Recent agent changes" footer="Everything agents changed, newest first. Fix anything wrong in its tab.">
          {actions.map(a => (
            <Row
              key={a.id}
              title={`${ACTION_LABELS[a.action] || a.action}${describeAction(a) ? ` · ${describeAction(a)}` : ''}`}
              titleClassName="text-[15px]"
              subtitle={`${a.token_label} · ${formatWhen(a.created_at)}`}
            />
          ))}
        </Section>
      )}

      {status && <p className="px-1 text-[13px] text-label-2">{status}</p>}
    </Sheet>
    {guideOpen && (
      <GuideEditor
        guide={guide}
        copyText={copyText}
        onClose={() => setGuideOpen(false)}
        onSaved={async (message) => { await loadGuide(); say(message) }}
      />
    )}
    </>
  )
}
