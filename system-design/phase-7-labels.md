# Phase 7: Labels System

## Overview
Introduce a labels system that allows users to categorize their focus sessions by activity type (e.g., "leetcode", "learning", "work"). This enables better analytics and insights into how time is spent across different activities.

## User Story
As a user, I want to be able to categorize my sessions by type so that I can get more detailed stats based on activity. This will allow me to see analytics and trends for certain activities later on.

---

## Database Design

### Schema Changes

#### New Table: `labels`
```sql
CREATE TABLE labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  order_index INTEGER NOT NULL,  -- for ordering in UI (creation order)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER DEFAULT NULL  -- soft delete
);
```

**Constraints:**
- Maximum 8 labels (enforced atomically in the DB worker to avoid races)
- `name` must be unique
- `order_index` determines display order and keyboard shortcuts (1-8) and always stays within 0-7 by reusing freed slots when labels are deleted

#### Modified Table: `sessions`
```sql
ALTER TABLE sessions ADD COLUMN label_id INTEGER REFERENCES labels(id) ON DELETE SET NULL;
```

**Behavior:**
- `label_id` is nullable (sessions can be unlabeled)
- When a label is soft-deleted, all sessions with that label have `label_id` set to NULL

### Indexes
```sql
CREATE INDEX idx_sessions_label_id ON sessions(label_id);
CREATE INDEX idx_labels_deleted_at ON labels(deleted_at);
CREATE INDEX idx_labels_order_index ON labels(order_index);
```

---

## User Flows

### 1. Timer Screen - Label Selection (Before Starting)

**Visual Layout:**
- Label appears in top-right corner of timer screen
- KeyBox `[L]` followed by label tag (126px wide, square corners)
- If no label: shows "No Label" in grey border with transparent background
- If labeled: shows label name with light colored background (15% opacity), dark colored text and border
- No extra text - just `[L]` and the label

**Interaction:**
1. Press `L` key → dropdown opens below label with 16px gap
2. Dropdown shows all labels (max 8) in two-column layout:
   - Left column: KeyBoxes (0, 1-8, N)
   - Right column: Label tags (all 126px wide)
3. Each label row shows:
   - KeyBox with number (left)
   - Label button with light background, dark text/border, 60% opacity when not selected
   - Selected label at 100% opacity
4. Press number key (0, 1-8) → switches to that label, dropdown closes
5. Press `N` → opens label creation modal (if < 8 labels)
6. Click label → switches to that label, dropdown closes
7. Press `Esc` → closes dropdown without changing
8. Dropdown has transparent background, labels stack with 8px gap
9. "+ New Label" option shows below labels (if < 8 labels exist)

**Default Behavior:**
- On fresh app install: no labels exist, shows "No Label"
- When starting new timer: uses label from previous session (whether completed or interrupted)

### 2. Session Summary Screen - Label Assignment (After Session Ends)

**Visual Layout:**
- Label appears in top-right corner of session results
- Same layout as timer screen: `[L]` followed by label tag
- Same styling: square corners, 126px wide, light bg with dark text/border

**Interaction:**
1. Press `L` key → dropdown opens (same as timer screen)
2. Same two-column layout with KeyBoxes and labels
3. Selecting a label:
   - Updates the session's `label_id` in database
   - Closes dropdown
   - Updates label display on summary screen
4. Press `Esc` → closes dropdown without changing

### 3. Activities View - Label Assignment (Individual Session)

**Entry Point:**
- Click on individual activity in activities list → opens session detail view
- Label shown in detail view with same "L → change label" shortcut

**Interaction:**
- Same flow as Session Summary Screen
- Changes persist to database immediately
- Updates activities list view after change

### 4. Create New Label

**Entry Point:**
- From any label dropdown → "Add New" option at bottom
- From Profile → Labels settings page

**Flow:**
1. Modal opens with two steps:

   **Step 1: Name Entry**
   - Empty text input, cursor auto-focused
   - User types label name
   - Press `Enter` → proceed to Step 2
   - Press `Esc` → cancel and close modal

   **Step 2: Color Selection**
   - 4x4 grid of preset colors
   - Use arrow keys (↑→↓←) to navigate grid
   - Selected color has visual highlight
   - Press `Enter` → save label
   - Press `Esc` → save label (same as Enter)

2. After saving:
   - Label is created in database with next available `order_index`
   - If opened from timer/summary/activities: new label is automatically assigned to current session
   - If opened from settings: returns to settings page
   - Modal closes

**Validation:**
- Maximum 8 labels (enforced - N key and "+ New Label" don't appear when limit reached)
- Name must be unique (show error if duplicate)
- Name cannot be empty

**Important:**
- Modal blocks timer shortcuts (pressing Enter in modal does not start timer)

### 5. Profile → Labels Settings Page

**Navigation:**
- From home/timer screen: press `Cmd+P` → opens Profile page
- Profile page has vertical navigation on left side
- Sub-pages listed like activities list blocks
- For Phase 7: only "Labels" sub-page exists

**Labels Settings UI:**
- List of all labels (non-deleted)
- Each label row shows:
  - Color indicator
  - Label name
  - Shortcut number (1-9)
  - Edit action (future: click to edit name/color)
  - Delete action

**Delete Label:**
1. Click delete or press `D` when row selected
2. Shows "Press D to confirm" indicator (same UX as end/cancel session)
3. Press `D` again → soft delete label:
   - Set `deleted_at = NOW()`
   - Update all sessions: `SET label_id = NULL WHERE label_id = <deleted_id>`
4. Label removed from settings list

**Edit Label (Future):**
- Click on label or press `E` when selected
- Opens same modal as "Add New" with pre-filled name/color
- Same two-step flow

---

## API/Backend Changes

### New Database Functions

#### `createLabel(name: string, color: string): Promise<Label>`
- Validates max 8 labels
- Validates unique name
- Gets next `order_index` (finds lowest available slot 0-7)
- Inserts into `labels` table
- Returns created label

#### `getLabels(): Promise<Label[]>`
- Returns all non-deleted labels
- Ordered by `order_index ASC`

#### `updateSessionLabel(sessionId: string, labelId: number | null): Promise<void>`
- Updates `sessions.label_id`
- Handles null for "No Label"

#### `softDeleteLabel(labelId: number): Promise<void>`
- Sets `deleted_at` on label
- Updates all sessions with that label to `label_id = NULL`

#### `updateLabel(labelId: number, name?: string, color?: string): Promise<Label>` (Future)
- Updates label name and/or color
- Validates unique name if changing

---

## Frontend Components

### New Components

#### `LabelTag`
- Props: `label: Label | null`, `size?: 'small' | 'medium'`
- Hardcoded width: 126px, square corners
- If labeled: light background (15% opacity of label color), dark text and border (label color)
- If null: shows "No Label" in grey border with transparent background, grey text

#### `LabelDropdown`
- Props: `currentLabel: Label | null`, `onSelect: (labelId: number | null) => void`, `onAddNew: () => void`
- Two-column layout: KeyBoxes (left) + Labels (right, all 126px wide)
- Keyboard shortcuts: 0 (No Label), 1-8 for labels, N for new label, Esc to close
- Transparent background, labels stack with 8px gap
- "+ New Label" shows at bottom when < 8 labels (centered text, 126px wide)
- Selected label at 100% opacity, others at 60%

#### `LabelModal` (for Add/Edit)
- Two-step form: name entry → color picker
- 4x4 color grid with keyboard navigation
- Auto-focus and keyboard-driven

#### `ProfilePage`
- New page component with vertical navigation
- Left sidebar with sub-page list
- Right content area

#### `LabelsSettingsPage`
- List of labels with edit/delete actions
- Keyboard shortcuts for delete (D double-press)

### Modified Components

#### `TimerScreen`
- Add `LabelTag` in top-right
- Add "L → change label" shortcut indicator
- Implement `LabelDropdown` on `L` press

#### `SessionSummaryScreen`
- Add `LabelTag` next to duration
- Add "L → change label" shortcut indicator
- Implement `LabelDropdown` on `L` press

#### `ActivityDetailView`
- Add `LabelTag` display
- Add "L → change label" shortcut indicator
- Implement `LabelDropdown` on `L` press

#### `HomeScreen`
- Add `Cmd+P` shortcut to open Profile page

---

## Technical Considerations

### Label Shortcuts (1-8)
- Shortcuts are dynamic based on `order_index`
- Label at `order_index = 0` gets shortcut `1`
- Label at `order_index = 7` gets shortcut `8`
- `0` is reserved for "No Label"
- `N` is reserved for creating new labels
- When creating a label we scan existing non-deleted labels and assign the smallest unused `order_index`, so a delete/recreate cycle never produces an index ≥ 8

### Default Label Selection
- On app load, fetch the latest session (completed or interrupted) to seed a `lastUsedLabelId`
- Store `lastUsedLabelId` in front-end state and local storage so timers can default instantly and survive reloads
- Whenever a session label is chosen or changed (timer start, summary edit, activities view), optimistically update the local value and persist it; backend changes keep the DB authoritative

### Soft Delete Behavior
- Deleted labels are never shown in UI
- All queries filter `WHERE deleted_at IS NULL`
- Activities that had deleted labels show "No Label"

### Color Presets
- 4x4 grid = 16 colors
- Placeholder colors for Phase 7 (to be refined later)
- Store as hex codes in database

### Order Management
- Labels maintain creation order via `order_index`
- On delete: do NOT reorder remaining labels, but reuse the lowest available index when a new label is created to keep shortcuts 1-8 valid
- Future feature: manual reordering

### Session Label Updates
- `update_session_label` validates that the requested `label_id` exists and is not soft-deleted
- Fails with a clear error if the label has been deleted or never existed, ensuring sessions never point to hidden labels
- Labels are assigned at session creation time (passed to `start_timer` command)
- Can be changed during or after session via label dropdown

---

## Future Enhancements (Not in Phase 7)

1. **Edit Labels**: Change name/color of existing labels
2. **Reorder Labels**: Manual drag-and-drop or keyboard reordering
3. **Analytics by Label**: Time spent per label, trends, visualizations
4. **Auto-Label Assignment**: ML/rules-based label suggestion
5. **Label Templates**: Pre-defined label sets for different workflows
6. **Export/Import Labels**: Share label configs across devices

---

## Testing Checklist

- [x] Create label (max 8 enforced)
- [ ] Create label with duplicate name (error)
- [x] Assign label to session before timer starts
- [x] Change label after session ends
- [x] Change label from session results view
- [ ] Soft delete label (sessions become unlabeled)
- [x] Label dropdown keyboard shortcuts (0, 1-8, N)
- [x] Label dropdown navigation (L to open, Esc to close)
- [x] Add new label from dropdown (N key)
- [x] Two-step label creation flow (name → color)
- [x] Color picker keyboard navigation
- [ ] Profile page opens with Cmd+P
- [ ] Labels settings page shows all labels
- [x] Default label selection (last used)
- [x] "No Label" display and behavior
- [x] Enter key in label modal doesn't start timer
- [x] Label dropdown layout (KeyBoxes left, labels right)
- [x] Label styling (square corners, light bg, dark text/border)

---

## Migration

### Database Migration
```sql
-- Add label_id column to sessions
ALTER TABLE sessions ADD COLUMN label_id INTEGER REFERENCES labels(id) ON DELETE SET NULL;

-- Create labels table
CREATE TABLE labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER DEFAULT NULL
);

-- Create indexes
CREATE INDEX idx_sessions_label_id ON sessions(label_id);
CREATE INDEX idx_labels_deleted_at ON labels(deleted_at);
CREATE INDEX idx_labels_order_index ON labels(order_index);
```

### Data Migration
- No data migration needed (fresh feature)
- All existing sessions have `label_id = NULL` (unlabeled)
