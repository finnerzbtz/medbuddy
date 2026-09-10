# Blobby’s little thoughts

A curated, offline collection of 30 original self-care ideas and five short quotations. It appears as a compact speech bubble directly beneath the room in `CompanionPanel`, before the medication prompt, and uses the companion’s chosen name for assistive technology.

One thought at a time, with no visible section heading. Just the voice chooser and Mute / Unmute sit beneath the bubble. All 35 thoughts rotate automatically about once a minute, with six original tips interleaved with each quotation and no manual next button or filters. The initial position uses the local calendar date; each deck is exhausted before a thought repeats. The timer counts only visible time and pauses during narration/loading, dialogs, lost focus, hidden/offscreen bubbles, the feeding tray, or keyboard focus on a source link. Returning never catches up in a burst. The bubble’s tail points toward Blobby without covering the room or check-in action. Tips temporarily yield to care reactions and the feeding tray. Mute stops current and future speech but preserves the voice and other audio settings; Unmute reads the current thought and enables automatic reading. There is no notification, tracking, generated advice, streak, reward or medication-based selection.

Hide / Show retains keyboard focus. `preferences.showWisdom` is stored on this device and in backups. Older saves default to visible; invalid preference values are rejected. Calm settings hide the bubble, with a compact restore control on Today and a toggle in Help / My Blobby. A failed save never pretends the setting changed.

## Editorial sources

Original tips use optional, concrete language. They support rest, sensory differences, flexible plans, connection and small enjoyable activities, without promising a health outcome or assuming that everyone can walk, exercise or use a particular relaxation technique.

General background, reviewed 7 September 2026:

- [NHS Every Mind Matters](https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/top-tips-to-improve-your-mental-wellbeing/): enjoying small things, noticing the present, connection, gentle activity, writing and winding down.
- [National Autistic Society: sensory processing](https://www.autism.org.uk/advice-and-guidance/about-autism/sensory-processing): individual sensory needs, comfortable environments, familiar textures or movements, quieter recovery time and communication preferences.

Quotes were checked against the linked author’s own page or an edition of the original work on 7 September 2026. They are historical / personal reflections, not clinical recommendations. Preserve the edition and the excerpt marks when editing.

| Content ID | Attribution | Primary source / edition |
| --- | --- | --- |
| neff-kindness | Kristin Neff | [Author’s introduction](https://self-compassion.org/) — uses “support” in the current wording |
| lao-tzu-sprout | Lao Tzu | [Tao Te Ching, 64](https://www.gutenberg.org/files/216/216-h/216-h.htm), James Legge translation; excerpt |
| montaigne-belong | Michel de Montaigne | [Essays I.39, Solitude](https://www.earlymoderntexts.com/assets/pdfs/montaigne1580book1.pdf#page=107), Early Modern Texts edition |
| epictetus-grow | Epictetus | [Discourses, What Philosophy Promises (I.15)](https://www.gutenberg.org/files/10661/10661-h/10661-h.htm), George Long translation; excerpt |
| james-overlook | William James | [The Principles of Psychology, ch. 22, Reasoning](https://psychclassics.yorku.ca/James/Principles/prin22.htm), p. 369; excerpt |

Each quotation shows its author and a Source link labelled as opening in a new tab. The work / edition is available on the source link’s title and to screen readers. Sources need internet; thoughts and their three optional recorded voices are bundled locally. No external service or API key is used during playback. See `docs/mvp/blobby-voices.md` for the approved ElevenLabs authoring batch.

## Verification

- `npm run test:unit`: catalog integrity, filtering and coverage across local date / daylight-saving boundaries; preference migration and backup validation.
- `npm run test:wisdom`: all thoughts using the keyboard, focus, bubble placement and optional controls, quote provenance, no health-data changes, stable reading across midnight, hide / restore, save-failure recovery, mobile reflow and axe scans.
- `npm run test:wisdom-offline`: against the production preview on 4177 after `npm run build`; reload offline, automatically rotate all 35 thoughts, verify and decode all 108 voice clips, and exercise the three previews plus Unmute / Mute without external requests.
- `npm run test:accessibility`: existing app accessibility flows and scans.

Automated checks do not replace testing with screen readers and intended users.
