"use client";

import { useEffect, useRef, useState } from "react";

interface Suggestion {
  display_name: string;
}

export function AddressAutocompleteInput({ name, required }: { name: string; required?: boolean }) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timeout = setTimeout(async () => {
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;
      setIsLoading(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
        const response = await fetch(
          `${apiUrl}/address-suggest?q=${encodeURIComponent(query)}&limit=8`,
          { method: "GET" }
        );
        if (!response.ok) return;
        const data = (await response.json()) as { suggestions?: Suggestion[] };
        if (requestId !== requestIdRef.current) return;
        const next = data.suggestions ?? [];
        console.info("address_suggest response", { query, count: next.length, next });
        setSuggestions(next);
        setIsOpen(next.length > 0);
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
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
        placeholder="Start typing an address in Canterbury"
        autoComplete="off"
        className="w-full rounded-sm border border-ink-700/20 px-3 py-2"
      />
      {isLoading && <span className="absolute right-3 top-2.5 text-xs text-ink-500">Searching…</span>}
      {isOpen && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-sm border border-ink-700/20 bg-white py-1 text-sm shadow">
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
