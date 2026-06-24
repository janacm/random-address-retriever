import { KeyboardEvent, useEffect, useId, useState } from "react";
import { Search } from "lucide-react";
import { fetchCities } from "../api";
import type { CitySuggestion, ProvinceCode } from "../types";

interface CityComboboxProps {
  value: string;
  onChange: (value: string) => void;
  province: ProvinceCode | "";
  placeholder?: string;
  inputId?: string;
}

/**
 * Fuzzy city typeahead. Debounces input, queries `/api/cities` (scoped to the
 * selected province so it only ever offers cities that are actually
 * queryable), and lets the user pick with the mouse or keyboard. It degrades
 * gracefully: if the endpoint is unavailable the field still works as a plain
 * text input, so a missing `nar_cities` view never blocks a lookup.
 */
export function CityCombobox({
  value,
  onChange,
  province,
  placeholder,
  inputId,
}: CityComboboxProps) {
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [justSelected, setJustSelected] = useState(false);
  const listboxId = useId();

  useEffect(() => {
    // Skip the fetch triggered by programmatically setting the value on select.
    if (justSelected) {
      setJustSelected(false);
      return;
    }

    const term = value.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      fetchCities(term, province, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setSuggestions(results);
            setActiveIndex(-1);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
          }
        });
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [value, province, justSelected]);

  function selectSuggestion(suggestion: CitySuggestion) {
    setJustSelected(true);
    onChange(suggestion.city);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (activeIndex >= 0) {
        event.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && suggestions.length > 0;

  return (
    <div className="combo">
      <div className="comboInputWrap">
        <Search className="comboIcon" aria-hidden="true" size={16} />
        <input
          id={inputId}
          className="comboInput"
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            setOpen(true);
            onChange(event.target.value);
          }}
          onFocus={() => {
            if (suggestions.length > 0) {
              setOpen(true);
            }
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {showList ? (
        <ul className="comboList" id={listboxId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.city}-${suggestion.province ?? "all"}`}
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "comboOption active" : "comboOption"}
              // onMouseDown (not onClick) so selection runs before the input's blur.
              onMouseDown={(event) => {
                event.preventDefault();
                selectSuggestion(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span className="comboCity">{suggestion.city}</span>
              <small className="comboMeta">
                {suggestion.province ?? "Canada"} ·{" "}
                {suggestion.addressCount.toLocaleString()} addresses
              </small>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
