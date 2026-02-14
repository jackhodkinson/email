import { createContext, useContext } from "react";

export interface SearchBoxHandle {
  focus(): void;
}

export const SearchBoxContext = createContext<React.RefObject<SearchBoxHandle | null>>({
  current: null,
});

export function useSearchBox() {
  return useContext(SearchBoxContext);
}
