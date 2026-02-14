# Legend State v3 — Patterns for this codebase

Use `@legendapp/state` (v3 beta) for all new UI state. Never reach for `useState`/`useEffect`/`useCallback`/`memo()` to manage local or shared UI state — observables handle reactivity at the leaf level so re-renders only happen where data is read.

## Core rules

### 1. `$` suffix convention

All observables use a `$` suffix: `count$`, `store$`, `draft$`. This distinguishes observables from plain values at a glance.

### 2. Read with `.get()`, write with `.set()`

```ts
const count$ = observable(0)
count$.get()        // 0  — tracked in observing contexts
count$.peek()       // 0  — never tracked
count$.set(1)       // triggers listeners
count$.set(n => n + 1)  // updater function
```

Never mutate the raw value and set it back — Legend State compares by reference:
```ts
// BAD
const val = state$.get()
val.key = "new"
state$.set(val)          // no-op, same reference

// GOOD
state$.key.set("new")
state$.assign({ key: "new" })
```

### 3. Computed observables are functions

```ts
const state$ = observable({
  fname: "Jack",
  lname: "H",
  fullName: () => state$.fname.get() + " " + state$.lname.get(),
})
```

Accessing `state$.fullName.get()` creates a cached computed that re-evaluates only when deps change. Accessing `state$.fullName()` re-runs on every call.

### 4. Batch multiple writes

```ts
import { batch } from "@legendapp/state"

batch(() => {
  store$.items.push(newItem)
  store$.ui.selectedIndex.set(store$.items.length - 1)
})
// single notification, single render
```

---

## React integration

### `useObservable` — local component state

Replaces `useState`. The observable lives for the component's lifetime.

```tsx
function SearchBox() {
  const draft$ = useObservable("")
  // typing only re-renders the input, nothing else
  return <$React.input $value={draft$} className="search-input" />
}
```

### `useValue` — read an observable and re-render on change

Replaces the pattern of `useState` + `useEffect` to sync with external data.

```tsx
const Component = () => {
  const count = useValue(store$.count)       // re-renders when count changes
  const isEven = useValue(() => store$.count.get() % 2 === 0)  // computed
  return <div>{count} {isEven ? "even" : "odd"}</div>
}
```

### `observer` — track all `.get()` calls in one hook

Use when a component reads many observables. Inserts a single tracking hook instead of one per `useValue`.

```tsx
const ProfileCard = observer(function ProfileCard() {
  const name = store$.profile.name.get()
  const avatar = store$.profile.avatar.get()
  return <div><img src={avatar} />{name}</div>
})
```

### `useObserve` — side effects when observables change

Replaces `useEffect` with dependency arrays. Tracks automatically.

```tsx
useObserve(() => {
  document.title = `${store$.search.query.get() || "Inbox"} — Email`
})
```

---

## Fine-grained reactivity (render once)

These primitives let the parent component render **only once**. All updates happen at the leaf.

### `<Memo>` — self-updating text/elements

```tsx
function Header() {
  return (
    <h1>
      <Memo>{() => store$.search.query.get() ? "Search" : "Inbox"}</Memo>
    </h1>
  )
  // Header never re-renders. The <Memo> updates itself.
}
```

### `<Show>` — conditional rendering without parent re-render

```tsx
<Show if={store$.ui.showModal} else={() => <Placeholder />}>
  {() => <Modal />}
</Show>
```

### `<For>` — optimized list rendering

Each item gets its own tracking context. Parent doesn't re-render when items change.

```tsx
const Row = ({ item$ }: { item$: Observable<Email> }) => {
  const subject = useValue(item$.subject)
  return <div>{subject}</div>
}

function EmailList() {
  return <For each={store$.emails} item={Row} optimized />
}
```

**Important:** arrays of objects need a unique `id` or `key` field for `<For>` to track them.

### `$React.*` — reactive DOM elements with two-way binding

```tsx
<$React.input $value={draft$} />
<$React.div $className={() => isActive$.get() ? "active" : ""} />
<$React.div $style={() => ({ color: theme$.get() === "dark" ? "#fff" : "#000" })} />
```

`$value` on inputs creates a two-way binding — the observable updates on input, the input updates on `.set()`.

### `reactive()` — wrap any component to accept `$`-prefixed props

```tsx
import { reactive } from "@legendapp/state/react"
import { motion } from "framer-motion"

const $MotionDiv = reactive(motion.div)
// Now accepts $animate, $style, etc. as observable selectors
```

---

## State architecture for this app

### Global store for cross-component UI state

```ts
// lib/store.ts
import { observable } from "@legendapp/state"

export const ui$ = observable({
  activeSurface: "none" as "none" | "list" | "viewer",
  selectedIndex: -1,
  threadsOnly: false,
})
```

Any component reads just what it needs with `useValue(ui$.selectedIndex)`. Only that component re-renders when that leaf changes.

### Local observables for component-scoped state

```tsx
function SearchBox({ query }: { query: string | undefined }) {
  const draft$ = useObservable<string | null>(null)
  const value$ = useObservable(() => draft$.get() ?? query ?? "")
  // ...
}
```

### Passing observables as props (not values)

Pass the observable itself, not the `.get()` result. Children read what they need and only re-render for their own reads.

```tsx
// GOOD — child controls its own reactivity
<Profile profile$={store$.profile} />

// BAD — parent re-renders on every profile change, child gets a new object
<Profile profile={store$.profile.get()} />
```

### Context for subtree-scoped state

```tsx
const PageState = createContext<Observable<PageStore>>(undefined as any)

function Page() {
  const state$ = useObservable({ ... })
  return (
    <PageState.Provider value={state$}>
      <Children />
    </PageState.Provider>
  )
}
// useContext(PageState) never causes re-renders — the observable ref is stable.
// Only useValue/observer calls on its properties trigger renders.
```

---

## Patterns to avoid

### Don't sync state with useEffect

```tsx
// BAD — two sources of truth, async timing bugs
const [value, setValue] = useState(prop)
useEffect(() => setValue(prop), [prop])

// GOOD — computed observable derives from the source
const value$ = useObservable(() => someObservable$.get())
```

### Don't `.get()` in array maps (creates proxies + tracking)

```tsx
// BAD — creates a proxy per element, tracks every item
state$.items.forEach(item => sum += item.data.value.get())

// GOOD — get raw data first, iterate plain objects
state$.items.get().forEach(item => sum += item.data.value)
```

### Don't wrap components in `memo()` / `useCallback` for perf

With Legend State, components only re-render when their specific `useValue`/`.get()` calls change. `memo()` and `useCallback` are unnecessary boilerplate.

### Don't clone and re-set arrays/objects

```tsx
// BAD — cloning is slow and can break reference tracking
state$.set([...state$.get(), newItem])

// GOOD — mutate directly through the observable
state$.push(newItem)
state$.key.set("value")
state$[idx].delete()
```

---

## Integration with TanStack Router

Route loaders return plain data. Convert to observables at the page level, then pass observables down.

```tsx
function InboxPage() {
  const loaderData = Route.useLoaderData()
  // Wrap loader data in an observable that updates when loaderData changes
  const threads$ = useObservable(loaderData.threads)

  // UI state is purely observable — never triggers page re-render
  const selectedIndex$ = useObservable(-1)

  return (
    <div>
      <For each={threads$} item={EmailRow} optimized />
    </div>
  )
}
```

For URL-driven state (search params), the URL remains the source of truth. Use a computed observable to derive from it, and navigate on commit (Enter key, not on every keystroke).

---

## Quick reference

| React pattern | Legend State replacement |
|---|---|
| `useState(x)` | `useObservable(x)` |
| `useMemo(() => f(a, b), [a, b])` | `useObservable(() => f(a$.get(), b$.get()))` |
| `useEffect(() => { ... }, [dep])` | `useObserve(() => { ... })` |
| `useCallback(fn, [deps])` | Not needed — pass observables instead of callbacks |
| `memo(Component)` | Not needed — only `useValue`/`.get()` sites re-render |
| `{items.map(i => <Row key={i.id} />)}` | `<For each={items$} item={Row} optimized />` |
| `{condition && <Modal />}` | `<Show if={condition$}>{() => <Modal />}</Show>` |
| `<input value={val} onChange={...} />` | `<$React.input $value={val$} />` |
