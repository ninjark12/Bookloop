# Bookloop - Mobile Fixes & OAuth Task List for Claude Code

## Context
Refer to CLAUDE_CODE_CONTEXT.md for full project context. This document covers specific bugs to fix.

---

## Bug 1 - Google OAuth not redirecting on mobile

**Symptom:** Tapping "Sign in with Google" on mobile Firefox shows "signing in" loading state, the browser loading bar activates, but the page never navigates to Google's consent screen. Works fine on desktop.

**Root cause:** `authClient.signIn.social()` returns a redirect URL but mobile browsers don't automatically follow it. The client code needs to explicitly navigate.

**Fix in the login page (`src/app/(auth)/login/page.tsx`):**

Change the Google sign-in button handler from:
```tsx
onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })}
```

To:
```tsx
onClick={async () => {
  const res = await authClient.signIn.social({
    provider: "google",
    callbackURL: "/dashboard",
  });
  if (res?.url) {
    window.location.href = res.url;
  }
}}
```

If `res` doesn't contain a `url` property, fall back to direct navigation:
```tsx
onClick={() => {
  window.location.href = "/api/auth/signin/social?provider=google&callbackURL=/dashboard";
}}
```

Apply the same fix to GitHub OAuth if it exists on the login page.
Also apply to the register page if social sign-in buttons exist there.

---

## Bug 2 - Cannot toggle public/private when editing a journal entry

**File:** `src/components/JournalPageClient.tsx`

**Symptom:** When editing an existing entry, there's no way to change the `isPublic` flag. The checkbox only exists in the new entry form.

**Fix:**

1. Add state for editing isPublic:
```tsx
const [editIsPublic, setEditIsPublic] = useState(false);
```

2. Set it when entering edit mode - find the Edit button's onClick in `renderEntryDetail()` and update:
```tsx
onClick={() => {
  setEditContent(selectedEntry.content ?? "");
  setEditIsPublic(selectedEntry.isPublic ?? false);
  setEditMode(true);
}}
```

3. Add the checkbox in `renderEntryDetail()`, inside the `{editMode && (...)}` block, between the textarea and the save/cancel button row:
```tsx
<label htmlFor="edit-entry-public" style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
  <input id="edit-entry-public" type="checkbox" checked={editIsPublic} onChange={(e) => setEditIsPublic(e.target.checked)} />
  <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>Public</span>
</label>
```

4. Include `isPublic` in the PATCH request body in `handleEditSave()`:
```tsx
body: JSON.stringify({
  entryId: selectedEntry.id,
  content: editContent.trim(),
  isPublic: editIsPublic,
})
```

5. Update the optimistic entry update in `handleEditSave()`:
```tsx
const updated = { ...selectedEntry, content: editContent.trim(), isPublic: editIsPublic };
```

6. **Also update the API route** at `src/app/api/journal/route.ts` - the PATCH handler needs to accept and persist `isPublic`. Find the PATCH handler and add `isPublic` to the destructured body and the update query:
```tsx
const { entryId, content, isPublic } = body;
// in the update query, include isPublic if it's not undefined:
...(isPublic !== undefined && { isPublic }),
```

---

## Bug 3 - Mobile journal: bottom navbar blocks content and save button

**File:** `src/components/JournalPageClient.tsx`

**Symptom:** Claude Code added a bottom navigation bar on mobile. The save button is now hidden behind it. Entry content can't be scrolled fully. The entries list is also partially covered.

**Fix:**

1. Determine the bottom navbar height. Assume it's a constant, e.g.:
```tsx
const BOTTOM_NAV_HEIGHT = 56; // adjust to match actual height in px
```

2. The outer mobile container currently uses:
```tsx
height: "calc(100dvh - 64px)"
```
Change to:
```tsx
height: `calc(100dvh - 64px - ${BOTTOM_NAV_HEIGHT}px)`
```

3. The mobile modal (the `role="dialog"` div for new entry / entry detail) also uses:
```tsx
height: "calc(100dvh - 64px)"
```
Change to:
```tsx
height: `calc(100dvh - 64px - ${BOTTOM_NAV_HEIGHT}px)`
```

4. Add `paddingBottom` to scrollable content areas inside the mobile view so the last item isn't hidden:
```tsx
// On the entries list scrollable div:
paddingBottom: `${BOTTOM_NAV_HEIGHT + 16}px`

// On the modal content scrollable div:
paddingBottom: `${BOTTOM_NAV_HEIGHT + 16}px`
```

5. Make sure the bottom navbar itself has:
```tsx
position: "fixed",
bottom: 0,
left: 0,
right: 0,
zIndex: 40, // below the mobile modal (zIndex 50) so the modal covers it
```

---

## Bug 4 - Mobile journal header is squished

**File:** `src/components/JournalPageClient.tsx`

**Symptom:** The header bar on mobile has too many elements (Dashboard button, divider, cover image, book title, author, status dropdown, New entry button) causing everything to be compressed.

**Fix:**

In `renderHeader()`, hide the Dashboard back button and its adjacent divider on mobile. The `isMobile` variable is already available. Wrap them:

```tsx
{!isMobile && (
  <>
    <button type="button" onClick={() => router.push("/dashboard")} aria-label="Back to Dashboard"
      style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--muted-foreground)", fontSize: "12px", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
      <ChevronLeft size={14} aria-hidden="true" /> Dashboard
    </button>
    <div style={{ width: "0.5px", height: "16px", background: "var(--border)" }} aria-hidden="true" />
  </>
)}
```

The "New entry" button in the header is already hidden on mobile (`{!isMobile && (...)}`), so removing the Dashboard button should give enough space.

If the header is still cramped on small screens, also consider hiding the status dropdown label text on mobile and just showing the select, or moving the status dropdown into the bottom navbar.

---

## Bug 5 - Mobile entry detail not scrollable

**File:** `src/components/JournalPageClient.tsx`

**Symptom:** When viewing an entry on mobile (inside the modal), the entry text can't be scrolled if it's longer than the visible area.

**Likely cause:** The modal content div needs `overflowY: "auto"` and the inner content needs to not have `height: "100%"` fighting with the flex layout.

**Fix:**

In the mobile modal, the content wrapper already has:
```tsx
<div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "1rem 1.25rem" }}>
```

Check that `renderEntryDetail()` is not setting `height: "100%"` on its outer div. The current code has:
```tsx
<div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
```

Change `height: "100%"` to `minHeight: "100%"` for the entry detail wrapper so it can grow beyond the container and scroll:
```tsx
<div style={{ display: "flex", flexDirection: "column", gap: "1rem", minHeight: "100%" }}>
```

Also check the entry text display div - it has `flex: 1, overflowY: "auto"`. Inside the mobile modal this should work, but if the parent is constrained by `height: 100%`, the overflow won't trigger. The `minHeight` fix above should resolve it.

Apply the same `height: "100%"` -> `minHeight: "100%"` change to `renderForm()` as well for consistency.

---

## Testing checklist

After all fixes:

**OAuth:**
- [ ] Google sign-in works on mobile Firefox
- [ ] Google sign-in works on mobile Safari
- [ ] Google sign-in works on mobile Chrome
- [ ] Google sign-in still works on desktop
- [ ] GitHub sign-in works on mobile (if implemented)
- [ ] After OAuth sign-in, user lands on /dashboard

**Edit public toggle:**
- [ ] Editing an entry shows a Public checkbox
- [ ] Checkbox reflects the entry's current isPublic state
- [ ] Toggling public and saving persists the change
- [ ] The change is reflected in the feed (public entries visible to friends, private ones hidden)

**Mobile layout:**
- [ ] Journal entries list scrolls fully, last entry is visible above bottom navbar
- [ ] Tapping an entry opens the modal - full entry text is scrollable
- [ ] New entry form is fully visible - save button is not blocked by bottom navbar
- [ ] Header is not squished - book title and status dropdown have room
- [ ] Bottom navbar does not appear over the mobile modal
- [ ] Keyboard doesn't cause layout issues when textarea is focused

---
also try to make sure the book svg looks correct on mobile it looks fine on desktop when the window is shrunk to mobile but the text is cut off on mobile. Instead of bookloop reading journal or how it is right now take the account name and say "name's" Reading journal.
## Important patterns to follow
- All API route changes need outer try/catch returning JSON
- userId always from session, never from request body
- Test on actual mobile device, not just browser DevTools responsive mode (the viewport behaviour differs, especially for 100dvh and fixed positioning)
