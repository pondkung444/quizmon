"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SchoolAutocompleteProps = {
  value: string;
  onChange: (name: string) => void;
  required?: boolean;
};

type SchoolRow = { name: string };

export default function SchoolAutocomplete({ value, onChange, required }: SchoolAutocompleteProps) {
  const supabase = createClient();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<SchoolRow[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed.length < 1) return;

    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("schools")
        .select("name")
        .ilike("name", `%${trimmed}%`)
        .order("name")
        .limit(10);
      setSuggestions(data ?? []);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function selectSchool(name: string) {
    setQuery(name);
    onChange(name);
    setIsOpen(false);
  }

  async function addNewSchool() {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setAdding(true);

    const { data, error } = await supabase
      .from("schools")
      .upsert({ name: trimmed }, { onConflict: "name", ignoreDuplicates: true })
      .select("name");

    if (error) {
      setAdding(false);
      return;
    }

    let finalName = data?.[0]?.name;
    if (!finalName) {
      const { data: existing } = await supabase
        .from("schools")
        .select("name")
        .eq("name", trimmed)
        .maybeSingle();
      finalName = existing?.name ?? trimmed;
    }

    setAdding(false);
    selectSchool(finalName);
  }

  const trimmedQuery = query.trim();
  const effectiveSuggestions = trimmedQuery.length >= 1 ? suggestions : [];
  const hasExactMatch = effectiveSuggestions.some(
    (s) => s.name.toLowerCase() === trimmedQuery.toLowerCase()
  );
  const showAddOption = isOpen && trimmedQuery.length >= 2 && !hasExactMatch;

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <label className="text-sm font-medium text-text2">โรงเรียน</label>
      <input
        type="text"
        required={required}
        value={query}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          onChange(next.trim());
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="rounded-md border border-border bg-track px-3 py-2 text-text placeholder:text-text3 focus:border-gold focus:outline-none"
        placeholder="พิมพ์ชื่อโรงเรียน"
        autoComplete="off"
      />
      {isOpen && (effectiveSuggestions.length > 0 || showAddOption) && (
        <ul className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card shadow-lg">
          {effectiveSuggestions.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => selectSchool(s.name)}
                className="w-full px-3 py-2 text-left text-sm text-text hover:bg-track"
              >
                {s.name}
              </button>
            </li>
          ))}
          {showAddOption && (
            <li>
              <button
                type="button"
                disabled={adding}
                onClick={addNewSchool}
                className="w-full px-3 py-2 text-left text-sm text-gold-hi hover:bg-track disabled:opacity-50"
              >
                {adding ? "กำลังเพิ่ม..." : `เพิ่ม "${trimmedQuery}" เป็นโรงเรียนใหม่`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
