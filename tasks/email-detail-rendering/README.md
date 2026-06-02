# Email Detail View — Gmail-Quality Rendering Plan

## Goal

Bring the email detail view to "Gmail-quality": HTML emails render faithfully
(images, tables, styles, dark mode), inline content (CID images) works, remote
content is privacy-respecting, quoted text / signatures collapse cleanly,
attachments are first-class, and the surrounding chrome (subject, sender, labels)
matches what users expect from a modern mail client.

## Current State (assessment)

Touched files: `apps/web/src/components/email-content.tsx`,
`email-view.tsx`, `thread-message.tsx`, `lib/sanitize.ts`,
`lib/quote-detection.ts`; styles in `apps/web/src/styles.css`.

What works today:
- Sandboxed `srcdoc` iframe (no `allow-scripts`) for HTML bodies — solid base.
- `<style>` blocks extracted from `<head>` and re-injected into the iframe.
- DOMPurify sanitization (permissive iframe variant + strict text variant).
- Naive quote detection (`<blockquote>`, Gmail/Yahoo/Outlook class names,
  attribution regex) with a collapsible "Show quoted text" toggle.
- ResizeObserver-driven iframe height.
- Plain-text path: paragraph wrapping + URL autolink → prose typography.

### Concrete quality gaps

1. **Inline (CID) images don't render.** `<img src="cid:...">` is left as-is,
   so any email with logo/inline screenshot shows a broken image. We don't
   currently fetch or store attachment bytes from Gmail.
2. **Remote images leak the user's IP / read receipts.** We load every external
   `<img>` immediately. Gmail proxies through `googleusercontent.com` and most
   clients gate remote content behind a "Show images" banner.
3. **No tracking-pixel mitigation.** 1×1 images, `track.`, `open.` hosts,
   `?utm_*` beacons all fire on open.
4. **Wide emails overflow / break layout.** Newsletters with fixed 600–800px
   tables either horizontally scroll or get clipped. No fit-to-width scaling,
   no max-width container, no "viewport" handling.
5. **Dark mode is wrong for branded HTML.** We force a dark text color into the
   iframe even when the email ships its own background — produces unreadable
   dark-on-dark or light-on-light hybrids. Gmail leaves HTML mail on white.
6. **Quote detection is fragile.**
   - Splits on `html.indexOf(regex)` which can cut inside a tag.
   - Misses Apple Mail (`Begin forwarded message:`), Outlook
     `id="appendonsend"`, Superhuman/Front signatures, and `-- \n` signature
     blocks.
   - First `<blockquote>` heuristic catches *intentional* (non-reply) quotes
     in newsletters.
   - Runs on raw HTML, then DOMPurify reparses — two DOM passes per render.
7. **Plain-text typography ≠ HTML typography.** Plain emails use Tailwind
   `prose` while HTML emails use the iframe with a different base font.
   Switching between two messages in the thread feels jarring.
8. **No attachment UI in the detail view.** `hasAttachments` is a boolean only;
   users can't list, preview, or download.
9. **Header chrome is minimal.** No label chips, no star, no "via X" indicator
   for relayed senders, no Reply-To when different from From, no security /
   encryption indicator, no Gravatar / brand favicon fallback for the avatar
   (just the first letter, single muted color).
10. **Thread affordances missing.** No cross-message trimmed-content collapse,
    no "N earlier messages" stub between read messages, no "Expand all /
    Collapse all", no per-message permalink anchor.
11. **`mailto:` / `tel:` links** open the OS handler with no preview; no
    `mailto:` → in-app compose hand-off.
12. **Iframe sizing edge cases.** `documentElement.scrollHeight` overshoots
    when emails use `position: fixed` or empty padding; we never shrink past
    the 150 px floor; no `srcdoc` content-hash key, so a same-html re-mount
    flickers.
13. **No copy-link / print / "view original".** Power-user staples.
14. **Performance.** Each expanded message spins up a same-origin iframe and a
    fresh ResizeObserver. Long threads should pool iframes.

## Proposed Architecture

### Layered pipeline (`packages/core` + `apps/web`)

```
RFC-822 message
  └─► core: extractBody({html, text, inlineParts, attachments, charset})
        └─► core: rewriteCidUrls(html, inlineParts)   // cid: → /api/inline/...
        └─► core: classifyQuotes(html|text)           // DOM-range tree
        └─► core: sanitizeForIframe(html, policy)
        └─► web:  <EmailIframe html styles options/>
```

Move the parsing/rewriting layer into `packages/core` so the CLI can render
an HTML email to a terminal form via the same pipeline, and so the web app
can server-render quote detection (no `if (typeof window)` guard).

### Inline image (CID) handling

- Extend schema: `attachments(message_id, part_id, filename, mime, size,
  content_id, is_inline, data BLOB | path)`.
- On sync, persist inline parts (BLOB if small, file path if large).
- New server function `getInlinePart(messageId, partId)` + HTTP route.
- `rewriteCidUrls` in core; called before sanitize so the CLI benefits too.

### Remote-image policy

- Default: strip remote `<img src>` and `background-image: url()`; replace
  with `<img data-blocked-src>` placeholder.
- Header banner: "Images aren't displayed. [Show images] [Always trust
  sender]". "Always trust" persists in `trusted_senders` (per-account).
- Optional `/api/img?u=...` server-side proxy (strips cookies, caches).

### Quote / signature collapsing v2

- Operate on parsed DOM, not regex over HTML. Use `linkedom` on the server,
  `DOMParser` in the browser.
- Walk from the body's end and detect, in order:
  1. `<blockquote>` chain whose preceding sibling is an attribution line.
  2. Container with quote class / id (existing list plus `appendonsend`,
     `OLK_SRC_BODY_SECTION`, `mail-editor-reference-message`).
  3. Apple Mail `Begin forwarded message:` boundary.
  4. Standalone signature: `-- ` line or trailing `<div class="signature">`.
- Wrap each matched range in a single `<details class="quoted">` so the
  iframe itself owns expand/collapse (no JSX state, no re-mount).
- **Cross-message dedup**: hash each quoted block's normalized text; later
  messages that contain an earlier message's quoted hash hide the redundant
  span and show a Gmail-style "…" stub.

### Layout / fit-to-width

- Wrap iframe body in `<div class="email-shell">` with `max-width: 100%`,
  `min-width: 0`, `overflow-x: auto`.
- Post-load: if `body.scrollWidth > viewport.width`, apply
  `transform: scale(viewport.width / body.scrollWidth)` with
  `transform-origin: top left`, recompute height. Re-eval on resize.
- Cap scale 0.6–1.0; below 0.6 expose a horizontal scrollbar instead.

### Dark mode v2

- Probe: if the message defines its own background (root has non-empty
  `background-color`, or any descendant table has `bgcolor`), render with
  `color-scheme: light` and a white shell regardless of app theme.
- Otherwise inherit app theme colors.
- Per-message override: "View in light / dark" toggle.

### Iframe sizing v2

- Use `body.scrollHeight` (not `documentElement.scrollHeight`).
- Recompute on `load`, every `img.load/error`, `document.fonts.ready`,
  and `ResizeObserver` on body. Debounce to one animation frame.
- Cache last measured height per `messageId` in memory for flicker-free
  re-expansion.

### Header / chrome upgrades

- Avatar: deterministic color from `hash(senderEmail)`; if Gravatar exists,
  prefer it (lazy `<img>` with `referrerpolicy="no-referrer"`); fall back
  to initial.
- "via" indicator when `Return-Path` / `From` domain mismatches.
- Reply-To chip when different from From.
- Label chips in the detail header, color-coded.
- Security badge (encryption / DMARC) when headers allow inference.
- Actions: Star, Reply, Reply-All, Forward, Snooze, Print, View original,
  Report phishing, overflow menu.
- Keep keyboard shortcuts (`e`, `r`, `R`, `f`, `s`, `#`, `[`, `]`).

### Attachment row

- Below body: chip per attachment (icon + filename + size + menu:
  Preview / Download / Save).
- Inline previews for images (`<img>`) and PDFs (`<iframe>`) in a modal.

### Plain-text path

- Convert to the same iframe shell (`plainTextToHtml` → iframe) so
  typography matches HTML. Drop the divergent `prose` block.
- Quote toggle driven by the v2 DOM detector.

### "View original" / debug

- Modal showing raw RFC-822 (or full headers + raw HTML). Mirrors
  Gmail's "Show original".

## Implementation Phases

### Phase 1 — Foundations (1–2 PRs)
- [ ] Move `sanitize.ts` and `quote-detection.ts` into
      `packages/core/src/render/`. Add unit tests.
- [ ] Rewrite quote/signature detection on parsed DOM (linkedom server,
      DOMParser client). Wrap quoted ranges in a single `<details>`.
- [ ] Replace `prose` plain-text path with the iframe path; introduce a
      `plain-text` flag that selects a monospace fallback when desired.

### Phase 2 — Inline + remote images (1 PR)
- [ ] Core: parse inline parts during sync; persist with `content_id`,
      `is_inline`, bytes.
- [ ] Server function `getInlinePart(messageId, partId)` + HTTP route.
- [ ] `rewriteCidUrls` in core; called before sanitize.
- [ ] Remote-image gate: strip → placeholder → banner; "Show images" and
      "Always trust" persistence.

### Phase 3 — Layout + dark mode + sizing (1 PR)
- [ ] Fit-to-width transform with viewport observation.
- [ ] Email-defines-own-background detection; light-shell fallback.
- [ ] Per-message light/dark override.
- [ ] Iframe sizing v2 (body.scrollHeight, fonts.ready, img listeners,
      debounce, cached heights).

### Phase 4 — Attachments + header polish (1 PR)
- [ ] Attachment row UI + download endpoint.
- [ ] Avatar hash colors + optional Gravatar.
- [ ] "via", Reply-To, label chips, security badge.
- [ ] Reply-All, Forward, Print, View original actions.

### Phase 5 — Thread polish (1 PR)
- [ ] Cross-message trimmed-content collapsing.
- [ ] "N earlier messages" stub between read messages.
- [ ] Expand-all / Collapse-all.
- [ ] Per-message permalink anchor + scroll restoration.

### Phase 6 — Perf + edge cases (smaller PR)
- [ ] Pool / reuse iframe instances across long threads.
- [ ] Print stylesheet + `@media print` rules.
- [ ] CLI: render the same pipeline to terminal-friendly output.

## Files Affected

Core (new):
- `packages/core/src/render/sanitize.ts`
- `packages/core/src/render/quotes.ts`
- `packages/core/src/render/inline.ts`
- `packages/core/src/render/remote-images.ts`

Core (updated):
- `packages/core/src/db.ts` — attachments schema, trusted senders.
- `packages/core/src/sync.ts` — persist inline parts.

Web (updated):
- `apps/web/src/components/email-content.tsx` — thinner, drives core.
- `apps/web/src/components/email-view.tsx` — header polish.
- `apps/web/src/components/thread-message.tsx` — header polish.
- `apps/web/src/components/attachment-row.tsx` *(new)*.
- `apps/web/src/components/image-banner.tsx` *(new)*.
- `apps/web/src/server/functions.ts` — `getInlinePart`, `getRawMessage`,
  `trustSender`.
- `apps/web/src/styles.css` — email shell, banner, attachment chip styles.
- `apps/web/src/lib/sanitize.ts`, `lib/quote-detection.ts` — delete or
  re-export from core.

CLI (updated):
- `apps/cli/lib/render.ts` *(new)* — wire core render pipeline for terminal.

## Acceptance Criteria

- A Stripe receipt / Linear notification / GitHub PR digest each render
  pixel-similar to Gmail (no horizontal scroll on laptop, images visible
  when allowed).
- An email with a CID logo shows the logo without external network access.
- "Show images" gate visible on emails with external images; toggling it
  loads them. "Always trust" persists across reloads.
- Quoted text from prior thread message is collapsed by default and does
  not re-appear in later replies.
- Apple Mail and Outlook forwards detect the boundary correctly.
- Switching app theme does **not** invert HTML email backgrounds; toggle
  in header allows manual override.
- Attachments list renders with filename, size, and download works.
- Iframe height never overflows by more than 1 px after fonts and images
  load.
- New logic in `packages/core` has unit tests (`bun test`).
- CLI `cmail show <id>` uses the same pipeline.

## Open Questions

- Ship a self-hosted image proxy (privacy + caching) or just block?
- Store full RFC-822 bytes to power "View original" reliably, or re-fetch
  on demand from Gmail?
- Threshold for "small enough to inline as BLOB" vs "store to disk"
  (proposal: 256 KB).
- Does the Tauri build want a different sandbox policy (CSP-based vs
  iframe-`sandbox`)?
