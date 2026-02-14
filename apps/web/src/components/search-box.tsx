import { useImperativeHandle, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useObservable, useValue } from "@legendapp/state/react";
import { Search, X } from "lucide-react";

export interface SearchBoxHandle {
  focus(): void;
}

interface SearchBoxProps {
  query: string | undefined;
  threadsOnly: boolean;
  ref?: React.Ref<SearchBoxHandle>;
}

export function SearchBox({ ref, query, threadsOnly }: SearchBoxProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const draft$ = useObservable<string | null>(null);
  const prevQueryRef = useRef(query);

  // When the URL query changes (loader resolved, back/forward nav), sync up
  if (query !== prevQueryRef.current) {
    prevQueryRef.current = query;
    draft$.set(null);
  }

  const draft = useValue(draft$);
  const value = draft ?? query ?? "";

  useImperativeHandle(ref, () => ({
    focus() {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  }));

  const submitSearch = (searchValue: string) => {
    const trimmed = searchValue.trim() || undefined;
    navigate({
      to: "/",
      search: { q: trimmed, threads: threadsOnly || undefined, category: undefined },
    });
  };

  const handleClear = () => {
    draft$.set(null);
    navigate({
      to: "/",
      search: { q: undefined, threads: threadsOnly || undefined, category: undefined },
    });
  };

  return (
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search emails..."
        value={value}
        onChange={(e) => draft$.set(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitSearch(e.currentTarget.value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            handleClear();
            inputRef.current?.blur();
          }
        }}
        className="search-input"
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
