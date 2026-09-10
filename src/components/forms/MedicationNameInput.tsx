import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { suggestMedicationNames, normaliseMedicationName } from '@/domain/medicationNames';
import './medication-name.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  previousNames: readonly string[];
  invalid: boolean;
}
export default function MedicationNameInput({ value, onChange, previousNames, invalid }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [active, setActive] = useState(-1);
  const [composing, setComposing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const suggestions = useMemo(
    () => suggestMedicationNames(value, previousNames),
    [value, previousNames],
  );
  const searching =
    focused && !dismissed && !composing && normaliseMedicationName(value).length >= 2;
  const open = searching && suggestions.length > 0;
  const activeId = open && suggestions[active] ? `med-name-option-${active}` : undefined;
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setAnnouncement(
          !searching
            ? ''
            : suggestions.length
              ? `${suggestions.length} name ${suggestions.length === 1 ? 'suggestion' : 'suggestions'} available. Use the up and down arrow keys to explore, then Enter to choose. You can also keep your own name.`
              : 'No matching names. You can keep the name you typed.',
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [searching, suggestions]);
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);
  const choose = (name: string) => {
    onChange(name);
    setDismissed(true);
    setActive(-1);
    input.current?.focus({ preventScroll: true });
  };
  return (
    <div
      className="field medication-name-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
          setDismissed(true);
          setActive(-1);
        }
      }}
    >
      <label htmlFor="med-name">Medication name</label>
      <div className="medication-name-control">
        <Search className="medication-name-icon" size={19} aria-hidden="true" />
        <input
          ref={input}
          required
          id="med-name"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? 'med-name-suggestions' : undefined}
          aria-activedescendant={activeId}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          maxLength={80}
          placeholder="Start typing a name"
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
            setActive(-1);
          }}
          onCompositionStart={() => {
            setComposing(true);
            setActive(-1);
          }}
          onCompositionEnd={() => {
            setComposing(false);
            setDismissed(false);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setDismissed(false);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || composing || event.ctrlKey || event.metaKey)
              return;
            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
              event.preventDefault();
              setDismissed(false);
              setActive(
                !open || active < 0
                  ? event.key === 'ArrowDown'
                    ? 0
                    : suggestions.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        suggestions.length - 1,
                        active + (event.key === 'ArrowDown' ? 1 : -1),
                      ),
                    ),
              );
            } else if (event.key === 'Enter' && open && suggestions[active]) {
              event.preventDefault();
              choose(suggestions[active].name);
            } else if (event.key === 'Escape' && searching) {
              event.preventDefault();
              event.stopPropagation();
              setDismissed(true);
              setActive(-1);
            } else if (event.key === 'Tab') {
              setDismissed(true);
              setActive(-1);
            } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
              setActive(-1);
          }}
        />
      </div>
      {open && (
        <div className="medication-name-popup">
          <ul id="med-name-suggestions" role="listbox" aria-label="Medication name suggestions">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.name}
                id={`med-name-option-${index}`}
                role="option"
                aria-selected={index === active}
                className="medication-name-option"
                onPointerDown={(event) => {
                  if (event.button === 0) event.preventDefault();
                }}
                onClick={() => choose(suggestion.name)}
              >
                <span>
                  <span className="medication-name-label">{suggestion.name}</span>
                  {(suggestion.previous || suggestion.similarSpelling) && (
                    <span className="medication-name-detail">
                      {[
                        suggestion.previous && 'Used before',
                        suggestion.similarSpelling && 'Similar spelling',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                <Check size={18} aria-hidden="true" className="medication-name-check" />
              </li>
            ))}
          </ul>
          <p className="medication-name-footnote">Choose the name on your medication label.</p>
        </div>
      )}
      {searching && !suggestions.length && (
        <p className="medication-name-empty">No match found. You can use the name you’ve typed.</p>
      )}
      <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}
