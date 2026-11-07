// Food rules and the reasons behind them, shown at the top of Home ("My rules").
// These are starter rules: make them yours. Each rule has a one-line summary
// (always visible) and the "why" / "exceptions" that open when it's tapped.
// icon: house | candy-off | leaf (see ICONS in components/MyRules.jsx)
// tone: green | pink | teal. Set RULES to [] to hide the card.

export const RULES = [
  {
    id: 'home',
    icon: 'house',
    tone: 'green',
    title: 'Cook at home by default.',
    summary: 'Home food is cheaper, healthier and under my control.',
    why: [
      ['I decide what goes in it.', 'At home I choose the oil, salt, sugar and portion. Restaurant and takeout food is built to taste good, not to be good for me, so it usually carries more of all three, and bigger plates than I need.'],
      ['It saves real money.', 'A takeout meal with fees, tax and tip often costs four or five times the same meal cooked at home. A few home-cooked dinners a week add up to a lot over a year.'],
      ['No daily debate.', 'A default means I don’t have to win the argument with myself every evening. The decision is already made.'],
      ['The food is already here.', 'My pantry and meals list exist so that cooking is the easy option, and food I already paid for doesn’t go to waste.'],
    ],
    exceptionsTitle: 'When eating out is fine',
    exceptions: [
      'Going out with family or friends.',
      'Celebrations and special occasions.',
      'Being someone’s guest.',
      'Travelling, or anywhere I genuinely can’t cook.',
    ],
    exceptionsNote: 'The exception is about the people, not the food. Being bored, tired or craving something is not an exception. Even when I do eat out, I pick the best option on the menu.',
  },
  {
    id: 'sugar',
    icon: 'candy-off',
    tone: 'pink',
    title: 'Go easy on sugar and refined carbs.',
    summary: 'They spike blood sugar, then leave me hungrier than before.',
    why: [
      ['The spike and the crash.', 'Sugar, white bread, pastries and juice turn into glucose fast. Blood sugar shoots up, then comes down hard, and an hour or two later I’m tired and craving more.'],
      ['Calories that don’t fill me up.', 'With little protein or fibre to keep me full, it’s easy to eat a lot and still be hungry. One can of soda has about 35–40 g of sugar, more than the WHO’s ideal daily limit of about 25 g.'],
      ['Cravings shrink when I cut back.', 'The more sugar I eat, the more I want. After a couple of weeks with less, cravings fade and fruit tastes sweet again.'],
    ],
    exceptionsTitle: 'Better swaps',
    exceptions: [
      'Fruit instead of dessert.',
      'Water, tea or sparkling water instead of soda or juice.',
      'Whole-grain bread, brown rice and oats instead of the white versions.',
      'Protein and vegetables first, carbs last.',
    ],
  },
  {
    id: 'healthy',
    icon: 'leaf',
    tone: 'teal',
    title: 'Eat real, good food.',
    summary: 'Good food is an investment, and it saves money too.',
    why: [
      ['Healthy staples are the cheap ones.', 'Lentils, beans, eggs, oats, rice and frozen vegetables cost far less per meal than takeout or packaged snacks.'],
      ['Better energy every day.', 'Real food keeps energy steady, so I think more clearly, work better and feel better.'],
      ['Every meal is a vote.', 'One meal won’t make or break me, but each one is a vote for the person I want to be.'],
    ],
  },
]

export const QUOTES = [
  { text: 'A healthy person has a thousand wishes, but a sick person has only one.', by: 'Proverb' },
  { text: 'It is health that is real wealth, and not pieces of gold and silver.', by: 'Mahatma Gandhi' },
  { text: 'The greatest wealth is health.', by: 'Virgil' },
  { text: 'Take care of your body. It’s the only place you have to live.', by: 'Jim Rohn' },
  { text: 'You only get one body for your whole life. Look after it like the only car you’ll ever own.', by: 'Warren Buffett (paraphrased)' },
  { text: 'He who has health has hope, and he who has hope has everything.', by: 'Arabian proverb' },
  { text: 'Every action you take is a vote for the type of person you wish to become.', by: 'James Clear' },
]
