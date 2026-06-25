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
  // "empty" means the lookup succeeded but matched no city — distinct from
  // "idle" (too short / endpoint unavailable), so we never claim "no cities
  // found" when the request itself failed.
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "results">(
    "idle"
  );
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
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setStatus("loading");
      fetchCities(term, province, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setSuggestions(results);
            setActiveIndex(-1);
            setStatus(results.length > 0 ? "results" : "empty");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            // Degrade gracefully: keep the field usable as plain text and show
            // no dropdown rather than a misleading "no cities found".
            setSuggestions([]);
            setStatus("idle");
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
    setStatus("idle");
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

  const term = value.trim();
  const hasQuery = term.length >= 2;
  // Show the dropdown for real suggestions, while a fetch is in flight (when we
  // have nothing to show yet), or to report that nothing matched.
  const showLoading = status === "loading" && suggestions.length === 0;
  const showEmpty = status === "empty";
  const showList =
    open && hasQuery && (suggestions.length > 0 || showLoading || showEmpty);

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
            if (suggestions.length > 0 || status === "empty") {
              setOpen(true);
            }
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {showList ? (
        <ul className="comboList" id={listboxId} role="listbox">
          {showLoading ? (
            <li className="comboStatusRow" role="presentation">
              Searching…
            </li>
          ) : null}
          {showEmpty ? (
            <li className="comboStatusRow" role="presentation">
              No cities found for “{term}”.
            </li>
          ) : null}
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
