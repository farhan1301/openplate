// Placeholder art for meals and favorites that don't have a photo yet:
// a food emoji guessed from the name (or cuisine) on a warm gradient that is
// stable per name, so the same meal always looks the same.

const KEYWORDS = [
  [/biryani|pulao|pilaf|fried rice|\brice\b/, '🍚'],
  [/curry|karahi|korma|masala|tikka|butter chicken|daal|dal\b|nihari|haleem|qorma|saag/, '🍛'],
  [/ramen|pho|noodle|lo mein|chow mein|udon|soba|pad thai/, '🍜'],
  [/pasta|spaghetti|lasagn|penne|macaroni|mac and cheese|alfredo|carbonara/, '🍝'],
  [/pizza/, '🍕'],
  [/burger/, '🍔'],
  [/sandwich|sub\b|panini|club/, '🥪'],
  [/wrap|shawarma|gyro|kebab|kabab|falafel|doner/, '🥙'],
  [/taco|burrito|quesadilla|nacho|enchilada|fajita/, '🌮'],
  [/sushi|sashimi|maki|onigiri/, '🍣'],
  [/dumpling|momo|gyoza|dim sum|bao/, '🥟'],
  [/salad|bowl/, '🥗'],
  [/soup|stew|chili|broth|shorba/, '🍲'],
  [/omelet|egg|shakshuka|frittata/, '🍳'],
  [/pancake|waffle|crepe/, '🥞'],
  [/paratha|naan|roti|chapati|bread|toast|bagel/, '🫓'],
  [/oat|porridge|cereal|granola|yogurt|yoghurt|parfait/, '🥣'],
  [/smoothie|shake|lassi|juice/, '🥤'],
  [/chai|tea\b|coffee|latte/, '☕'],
  [/cake|brownie|cookie|muffin|cupcake/, '🍰'],
  [/ice cream|kulfi|gelato/, '🍨'],
  [/kheer|pudding|custard|halwa|dessert|sweet/, '🍮'],
  [/fries|chips/, '🍟'],
  [/steak|beef|lamb|mutton|chop/, '🥩'],
  [/wing|drumstick|chicken|tandoori/, '🍗'],
  [/fish|salmon|tuna|cod|tilapia/, '🐟'],
  [/shrimp|prawn/, '🍤'],
  [/potato|aloo/, '🥔'],
  [/fruit|banana|apple|berry|mango/, '🍓'],
  [/bbq|barbecue|grill|seekh|boti|tikka/, '🍢'],
]

const CUISINES = {
  indian: '🍛', pakistani: '🍢', italian: '🍝', mexican: '🌮', chinese: '🥡', japanese: '🍣',
  thai: '🍜', korean: '🍲', vietnamese: '🍜', american: '🍔', 'middle eastern': '🥙',
  mediterranean: '🫒', turkish: '🥙', french: '🥐', greek: '🥗', lebanese: '🥙', afghan: '🍢',
}

const CATEGORIES = { breakfast: '🍳', snack: '🥨', dessert: '🍰', 'quick meal': '🥪', lunch: '🥗' }

export function foodEmoji(name, { cuisine, category, kind } = {}) {
  const text = (name || '').toLowerCase()
  const match = KEYWORDS.find(([pattern]) => pattern.test(text))
  if (match) return match[1]
  const byCuisine = CUISINES[(cuisine || '').trim().toLowerCase()]
  if (byCuisine) return byCuisine
  const byCategory = CATEGORIES[(category || '').trim().toLowerCase()]
  if (byCategory) return byCategory
  return kind === 'restaurant' ? '🏪' : '🍽️'
}

const PALETTES = [
  ['#ffb36b', '#ff6f61'],
  ['#ffd36e', '#ff9a3d'],
  ['#9be1a0', '#3fb68b'],
  ['#ffa6c1', '#ff5f8f'],
  ['#a8c7ff', '#6b8cff'],
  ['#ffcf99', '#e8875a'],
  ['#c7b3ff', '#8f6bff'],
  ['#8fe3d8', '#3ba6c4'],
]

export function foodGradient(name) {
  let hash = 0
  for (const char of name || '') hash = (hash * 31 + char.charCodeAt(0)) | 0
  const [from, to] = PALETTES[Math.abs(hash) % PALETTES.length]
  return `linear-gradient(135deg, ${from}, ${to})`
}
