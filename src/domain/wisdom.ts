/** Curated, offline reflections. Never selected from medication or mood data. */
export type WisdomFilter = 'all' | 'tips' | 'quotes';
export type LittleThought =
  | { id: string; kind: 'tip'; text: string }
  | {
      id: string;
      kind: 'quote';
      text: string;
      author: string;
      work: string;
      url: string;
    };

// Original copy, informed by the general wellbeing resources below where relevant.
export const SELF_CARE_RESOURCES = [
  {
    title: 'NHS · Tips for mental wellbeing',
    url: 'https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/top-tips-to-improve-your-mental-wellbeing/',
  },
  {
    title: 'National Autistic Society · Sensory processing',
    url: 'https://www.autism.org.uk/advice-and-guidance/about-autism/sensory-processing',
  },
] as const;

const tips: LittleThought[] = [
  { id: 'rest', kind: 'tip', text: 'Rest can be part of today’s plan.' },
  { id: 'sip', kind: 'tip', text: 'If you’d like, pause for a sip of your drink.' },
  {
    id: 'small-step',
    kind: 'tip',
    text: 'Make the next step small enough to begin: open the page, set out a mug, or put one thing away.',
  },
  { id: 'note', kind: 'tip', text: 'Let a note or reminder hold one thing for you.' },
  { id: 'change-plans', kind: 'tip', text: 'You can change a plan when your energy changes.' },
  { id: 'quiet', kind: 'tip', text: 'A quiet moment counts, even when nothing gets ticked off.' },
  {
    id: 'familiar',
    kind: 'tip',
    text: 'A familiar texture or a gentle movement can be a small comfort. Choose what feels good to you.',
  },
  {
    id: 'soften',
    kind: 'tip',
    text: 'If there’s too much input, soften one thing: the light, the sound, or an uncomfortable layer.',
  },
  { id: 'answer', kind: 'tip', text: 'You can ask for a little more time to answer.' },
  { id: 'message', kind: 'tip', text: 'A message can be as simple as “Thinking of you.”' },
  { id: 'company', kind: 'tip', text: 'Being together can mean sharing a room without talking.' },
  {
    id: 'one-sentence',
    kind: 'tip',
    text: 'Try writing one sentence about how today feels. You can leave it there.',
  },
  {
    id: 'thought-on-paper',
    kind: 'tip',
    text: 'If a thought feels loud, you can write it down and come back to it.',
  },
  {
    id: 'notice',
    kind: 'tip',
    text: 'Notice one ordinary thing you like: a warm mug, a colour, or a patch of light.',
  },
  { id: 'look-forward', kind: 'tip', text: 'Pick a small thing to look forward to.' },
  {
    id: 'support',
    kind: 'tip',
    text: 'When a day feels heavy, reaching out for support is an option.',
  },
  { id: 'listen', kind: 'tip', text: 'You can ask someone to listen without fixing anything.' },
  {
    id: 'different-needs',
    kind: 'tip',
    text: 'Your needs are allowed to be different from someone else’s.',
  },
  {
    id: 'one-moment',
    kind: 'tip',
    text: 'One difficult moment doesn’t have to describe the whole day.',
  },
  { id: 'kindness', kind: 'tip', text: 'You deserve kindness on unfinished days too.' },
  { id: 'joy', kind: 'tip', text: 'It’s okay to take joy in something just because you like it.' },
  { id: 'space', kind: 'tip', text: 'Leave a little space between activities if you can.' },
  { id: 'pause', kind: 'tip', text: 'A small pause before the next thing may be enough for now.' },
  { id: 'later', kind: 'tip', text: 'Set out one comforting thing for later.' },
  {
    id: 'movement',
    kind: 'tip',
    text: 'If moving would feel good, choose a gentle movement that works for your body.',
  },
  { id: 'hobby', kind: 'tip', text: 'You can enjoy a hobby without needing to improve at it.' },
  {
    id: 'comfortable-space',
    kind: 'tip',
    text: 'Choose one small part of your space to make comfortable.',
  },
  {
    id: 'boundary',
    kind: 'tip',
    text: 'A boundary can be kind and clear: “I need a little quiet.”',
  },
  {
    id: 'few-words',
    kind: 'tip',
    text: 'If words are hard today, a short text or a gesture can help you connect.',
  },
  {
    id: 'wind-down',
    kind: 'tip',
    text: 'Consider a small wind-down cue for tonight, like dimmer light or a familiar song.',
  },
];

// Verified against the linked original works / author’s own website, 7 September 2026.
// Ellipses mark excerpts; source editions matter because translations differ.
const quotes: LittleThought[] = [
  {
    id: 'neff-kindness',
    kind: 'quote',
    text: 'With self-compassion, we give ourselves the same kindness and support we’d give to a good friend',
    author: 'Kristin Neff',
    work: 'Self-Compassion.org · introduction',
    url: 'https://self-compassion.org/',
  },
  {
    id: 'lao-tzu-sprout',
    kind: 'quote',
    text: 'The tree which fills the arms grew from the tiniest sprout …',
    author: 'Lao Tzu',
    work: 'Tao Te Ching, 64 · James Legge translation',
    url: 'https://www.gutenberg.org/files/216/216-h/216-h.htm',
  },
  {
    id: 'montaigne-belong',
    kind: 'quote',
    text: 'The greatest thing in the world is to know how to belong to oneself.',
    author: 'Michel de Montaigne',
    work: 'Essays I.39 · Early Modern Texts edition',
    url: 'https://www.earlymoderntexts.com/assets/pdfs/montaigne1580book1.pdf#page=107',
  },
  {
    id: 'epictetus-grow',
    kind: 'quote',
    text: '… let it flower first, then put forth fruit, and then ripen.',
    author: 'Epictetus',
    work: 'Discourses I.15 · George Long translation',
    url: 'https://www.gutenberg.org/files/10661/10661-h/10661-h.htm',
  },
  {
    id: 'james-overlook',
    kind: 'quote',
    text: '… the art of being wise is the art of knowing what to overlook.',
    author: 'William James',
    work: 'The Principles of Psychology, ch. 22',
    url: 'https://psychclassics.yorku.ca/James/Principles/prin22.htm',
  },
];

// Six tips, then a quote. Every thought appears once before the deck repeats.
export const LITTLE_THOUGHTS: readonly LittleThought[] = quotes.flatMap((quote, i) => [
  ...tips.slice(i * 6, (i + 1) * 6),
  quote,
]);

/** Rotate by the local calendar day, without a timer or a dependence on health data. */
export function thoughtsForDay(day: Date, filter: WisdomFilter): readonly LittleThought[] {
  const deck = LITTLE_THOUGHTS.filter(
    (item) => filter === 'all' || item.kind === (filter === 'tips' ? 'tip' : 'quote'),
  );
  const calendarDay = Math.floor(
    Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / 86400000,
  );
  const start = ((calendarDay % deck.length) + deck.length) % deck.length;
  return [...deck.slice(start), ...deck.slice(0, start)];
}
