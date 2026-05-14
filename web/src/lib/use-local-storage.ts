"use client";

import { useEffect, useState } from "react";

export function useLocalStorageBoolean(
  key: string,
  initial: boolean = false,
): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const saved = window.localStorage.getItem(key);
    if (saved !== null) setValue(saved === "1");
  }, [key]);

  useEffect(() => {
    window.localStorage.setItem(key, value ? "1" : "0");
  }, [key, value]);

  return [value, setValue];
}
