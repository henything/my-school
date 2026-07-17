"use client";

import { Check, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type SearchableComboboxOption = {
  value: string;
  label: string;
  description?: string;
  searchText?: string;
};

type SearchableComboboxProps = {
  name: string;
  options: SearchableComboboxOption[];
  defaultValue?: string;
  placeholder: string;
  emptyValueLabel?: string;
  ariaLabel?: string;
  required?: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
};

const MAX_VISIBLE_OPTIONS = 14;

export function SearchableCombobox({
  name,
  options,
  defaultValue = "",
  placeholder,
  emptyValueLabel,
  ariaLabel,
  required = false,
  disabled = false,
  compact = false,
  className
}: SearchableComboboxProps) {
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const [query, setQuery] = useState(() => options.find((option) => option.value === defaultValue)?.label ?? "");
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = useMemo(() => options.find((option) => option.value === selectedValue), [options, selectedValue]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalize(query);

    if (!normalizedQuery) {
      return options.slice(0, MAX_VISIBLE_OPTIONS);
    }

    return options
      .filter((option) => normalize(`${option.label} ${option.description ?? ""} ${option.searchText ?? ""}`).includes(normalizedQuery))
      .slice(0, MAX_VISIBLE_OPTIONS);
  }, [options, query]);

  const hiddenOptionCount = Math.max(0, options.length - filteredOptions.length);

  useEffect(() => {
    const nextSelected = options.some((option) => option.value === defaultValue) ? defaultValue : "";
    const nextSelectedOption = options.find((option) => option.value === nextSelected);
    setSelectedValue(nextSelected);
    setQuery(nextSelectedOption?.label ?? "");
  }, [defaultValue, options]);

  useEffect(() => {
    const root = rootRef.current;
    const form = root?.closest("form");

    if (!form) {
      return;
    }

    function onReset() {
      const nextSelected = options.some((option) => option.value === defaultValue) ? defaultValue : "";
      const nextSelectedOption = options.find((option) => option.value === nextSelected);
      setSelectedValue(nextSelected);
      setQuery(nextSelectedOption?.label ?? "");
      setIsOpen(false);
    }

    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue, options]);

  function selectOption(option: SearchableComboboxOption) {
    setSelectedValue(option.value);
    setQuery(option.label);
    setIsOpen(false);
  }

  function clearSelection() {
    setSelectedValue("");
    setQuery("");
    setIsOpen(false);
  }

  function restoreSelectedLabel() {
    window.setTimeout(() => {
      const root = rootRef.current;

      if (!root || root.contains(document.activeElement)) {
        return;
      }

      setQuery(selectedOption?.label ?? "");
      setIsOpen(false);
    }, 100);
  }

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <input type="hidden" name={name} value={selectedValue} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[var(--muted)]" aria-hidden="true" size={16} />
        <input
          id={inputId}
          className={cn("field w-full pl-10 pr-10", compact ? "min-h-10 text-sm" : null)}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-label={ariaLabel ?? placeholder}
          aria-required={required}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          onBlur={restoreSelectedLabel}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedValue("");
            setIsOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && isOpen && filteredOptions[0]) {
              event.preventDefault();
              selectOption(filteredOptions[0]);
            }

            if (event.key === "Escape") {
              setQuery(selectedOption?.label ?? "");
              setIsOpen(false);
            }
          }}
        />
        {!required && selectedValue ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[#eef3ef] hover:text-[var(--foreground)]"
            onClick={clearSelection}
            disabled={disabled}
            aria-label="Очистить выбор"
          >
            <X aria-hidden="true" size={15} />
          </button>
        ) : null}
      </div>

      {isOpen && !disabled ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-y-auto rounded-lg border border-[var(--line)] bg-white p-1 shadow-[0_18px_44px_rgba(31,37,35,0.16)]"
          onMouseDown={(event) => event.preventDefault()}
        >
          {!required && emptyValueLabel ? (
            <button type="button" role="option" aria-selected={selectedValue === ""} className="combo-option" onClick={clearSelection}>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{emptyValueLabel}</span>
              </span>
              {selectedValue === "" ? <Check aria-hidden="true" size={15} /> : null}
            </button>
          ) : null}

          {filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === selectedValue}
              className="combo-option"
              onClick={() => selectOption(option)}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{option.label}</span>
                {option.description ? <span className="block truncate text-xs text-[var(--muted)]">{option.description}</span> : null}
              </span>
              {option.value === selectedValue ? <Check className="shrink-0 text-[var(--accent)]" aria-hidden="true" size={15} /> : null}
            </button>
          ))}

          {filteredOptions.length === 0 ? <div className="px-3 py-2 text-sm font-semibold text-[var(--muted)]">Ничего не найдено</div> : null}
          {hiddenOptionCount > 0 && query.length === 0 ? (
            <div className="px-3 py-2 text-xs font-semibold text-[var(--muted)]">Введите текст, чтобы сузить список из {options.length} вариантов.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}
