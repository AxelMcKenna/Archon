"use client";

import { useEffect, useState } from "react";

interface Suggestion {
  display_name: string;
}

const ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS = 150;

export function AddressAutocompleteInput({
  name,
  required,
  initialValue = "",
}: {
  name: string;
  required?: boolean;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/backend";
        const response = await fetch(
          `${apiUrl}/address-suggest?q=${encodeURIComponent(query)}&limit=8`,
          { method: "GET", signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { suggestions?: Suggestion[] };
        const next = data.suggestions ?? [];
        setSuggestions(next);
        setIsOpen(next.length > 0);
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
        throw error;
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [value]);

  return (
    <div className="relative">
      <input
        name={name}
        required={required}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => setTimeout(() => setIsOpen(false), 120)}
        onFocus={() => setIsOpen(suggestions.length > 0)}
        placeholder="Start typing a New Zealand address"
        autoComplete="off"
        className="w-full rounded-sm border border-ink-700/20 px-3 py-2"
      />
      {isLoading && <span className="absolute right-3 top-2.5 text-xs text-ink-500">Searching…</span>}
      {isOpen && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md bg-surface-elevated py-1 text-sm shadow-elevated">
          {suggestions.map((suggestion) => (
            <li key={suggestion.display_name}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-ink-700/5"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setValue(suggestion.display_name);
                  setIsOpen(false);
                }}
              >
                {suggestion.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
