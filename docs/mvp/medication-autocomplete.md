# Medication name autocomplete

Added 9 September 2026 to the shared add/edit medication form. The field remains editable and is not restricted to a catalogue. This feature supports finding a spelling; it does not identify a medicine from symptoms or recommend a medicine, dose or substitute.

## Behaviour

- Suggestions appear after two characters, with at most five visible choices. Exact and prefix matches rank above partial and approximate matches.
- Small omissions, additions and adjacent swapped letters can produce a **Similar spelling** suggestion. Approximate matching starts at four characters and allows at most one edit for short queries, two for queries of eight or more characters.
- Names already saved on this device, including custom names, appear as **Used before**. Matching is case-insensitive; duplicate names collapse.
- Nothing is selected on typing, blur, Tab or Escape. Arrow keys explore suggestions and Enter explicitly chooses the active one. Touch and mouse choose on click/release, so a cancelled pointer gesture cannot select a medication.
- Selecting a suggestion changes only the name. Strength, tablet count, instructions and schedule stay as entered. Unknown names can be entered and saved normally.
- Search runs locally, including offline. Typed medication names are never sent to a search provider. If the user enables account sync, a saved medication follows the existing account sync behaviour.

## Source and scope

`src/generated/medication-names.json` contains 256 names sourced from the [NHS medicines A–Z](https://www.nhs.uk/medicines/), retrieved 9 September 2026. Each entry retains its source URL. General medicine classes were excluded; repeated adult/child or indication-specific headings were normalised. Formulation qualifiers and parenthetical brand/ingredient names were retained. Only name facts are bundled, with no NHS logos, descriptions, treatment advice or doses.

This is a starter UK name catalogue, not a complete list of medicines or brands and not an indication of current prescribing suitability or availability. Manual entry remains available. Refresh the catalogue deliberately from the source; review exclusions, deduplication and formulation qualifiers before release. No external lookup is performed at runtime.

## Accessibility and verification

The component follows the [WAI-ARIA editable combobox with manual selection pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/): a labelled input, listbox/options, expanded state, active descendant, and a debounced polite announcement. Input focus stays in the field, normal text editing is preserved, IME composition suppresses suggestions, touch targets are at least 52px tall, and selection has a border/checkmark as well as colour. The results sit in the document flow so they do not cover the dose fields; focused keyboard options scroll into view without animation. The original form error-summary link continues to focus the input.

Run `npm run test:medication-names` with the dev server at port 5177. It uses synthetic local records in isolated Chromium contexts, covering matching, manual selection, dose preservation, add/edit, unknown names, offline operation, saved names, touch/cancellation, composition input, form errors, no external requests, axe checks, and reflow from 320 to 1280 CSS pixels. Screenshots and results are written to `rebuild/generated/qa-medication-names`. Real VoiceOver and user testing with people with dyslexia remain part of accessibility release validation; an automated pass is not a conformance certification.
