# Spacelift POC

## Project Structure

- `grove.toml` — project config (`project_id = "spacelift"`)
- `modules/` — Grove module definitions (record, validate, event, action, query)
- `apps/` — Site-specific UI and API routes (admin, consultant, contractor, calendar)
- `start-server.sh` — production server (port 19555, subdomain routing)
- `start-dev.sh` — dev server with auto-restart (watchexec)

## Grove Module Queries

Queries must be explicitly defined in module.grove using `query` blocks with `gsql`/`sql`:

```grove
query list_things {
  gsql {
    SELECT id, name, status, created_at
    FROM thing ORDER BY created_at DESC
  }
  output: List<Object>
}

query get_thing {
  args {
    thing_id: String
  }
  sql {
    SELECT id, name, status, created_at
    FROM thing WHERE id = @thing_id
  }
  output: Object
}
```

- `gsql` for list queries (no args), `sql` for parameterized queries
- `output: List<Object>` for lists, `output: Object` for single records
- Queries are NOT auto-generated — each module must define its own
- Enum values from gsql may be returned with embedded quotes (e.g. `"\"monday\""`)

## Grove Route Patterns

### Auth

Routes must declare auth mode. Calendar/public routes use `auth public`:
```grove
route {
  auth public
  ...
}
```

### Mutation Routes (POST)

```grove
route {
  POST create_thing {
    data result {
      invoke module.action_name {
        field: input.body.field
      }
    }
  }
}
```

### Query Routes (GET)

**List** — returns array of records:
```grove
route {
  GET list {
    data records {
      query module.list_things { }
    }
  }
}
```

**Detail** — returns single record by ID (in `[id]/route.grove`):
```grove
route {
  GET {
    data record {
      query module.get_thing {
        thing_id: input.params.id
      }
    }
  }
}
```

### Frontend Data Fetching

- **List**: `fetch('/api/entity/list')` → returns JSON array
- **Detail**: `fetch('/api/entity/' + id)` → returns JSON object (may be array with one element)
- **Mutation**: `fetch('/api/entity/action_name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })`
- **Mutation on record**: `fetch('/api/entity/' + id + '/action_name', { method: 'POST', ... })`

## Page Rendering

### JQT Templates (server-side)

All `.html` page files are JQT templates — rendered server-side by the
[jqt](https://github.com/manzanohq/jqt) template engine. JQT auto-escapes
values by default, preventing XSS.

Template context:
- `{{ .params.id }}` — URL path parameters
- `{{ .query.key }}` — URL query parameters
- `{{ .secrets.api_key }}` — credential store secrets
- `{{ .page.title }}` — frontmatter values
- `{{ .children | trusted }}` — child content (in layouts)
- `{{ .data.record.field }}` — route query results (when a sibling `route.grove`
  with a GET `data` block exists, its results are merged into the template context)

Use `| trusted` only for known-safe HTML (e.g. child template content in layouts).

**Prefer server-side rendering**: Because JQT auto-escapes, rendering data
server-side via `{{ .data.record.name }}` is inherently safe against XSS.
Avoid client-side `innerHTML` with user data. Use Unpoly for page transitions
and form submissions to keep the server-rendered model without full page reloads.

### Do NOT use client-side innerHTML for user data

Pages should render user data server-side via JQT templates, not client-side
`innerHTML`. JQT auto-escaping prevents XSS by design. Use Unpoly for form
submissions and page transitions to avoid full reloads while keeping
server-rendered content.

If client-side JS is unavoidable (e.g., interactive calendar widget), use
`textContent` or `createElement` — never `innerHTML` with user-supplied values.

### Public-facing URLs

Public URLs (e.g. visit return links) must use **UUIDs or random tokens**, not
sequential aggregate IDs (`agg-{timestamp}-{counter}`). Sequential IDs are
enumerable and expose other users' data (IDOR vulnerability). Add a `visit_token`
(UUID) field to records that are referenced in public URLs.

## Manzano Web Components

**CDN**: `https://webcomponents-cdn.mzno.live/`
**Docs**: `https://webcomponents.mzno.live/`

### Loading

```html
<link rel="stylesheet" href="https://webcomponents-cdn.mzno.live/themes/manzano.css">
<link rel="stylesheet" href="https://webcomponents-cdn.mzno.live/themes/utilities.css">
<script type="module" src="https://webcomponents-cdn.mzno.live/manzano.js"></script>
```

### Key Components (all use `mz-` prefix)

**Form Controls**: `<mz-button>`, `<mz-input>`, `<mz-textarea>`, `<mz-select>` + `<mz-option>`, `<mz-checkbox>`, `<mz-switch>`, `<mz-radio-group>` + `<mz-radio>`, `<mz-date-picker>`, `<mz-date-range-picker>`, `<mz-field>`, `<mz-combobox>`, `<mz-number-input>`, `<mz-color-picker>`, `<mz-file-input>`, `<mz-input-otp>`

**Data Display**: `<mz-avatar>`, `<mz-badge>`, `<mz-tag>`, `<mz-card>`, `<mz-table>`, `<mz-data-table>`, `<mz-carousel>`

**Feedback**: `<mz-alert>`, `<mz-toast>`, `<mz-progress>`, `<mz-spinner>`, `<mz-skeleton>`

**Overlays**: `<mz-dialog>`, `<mz-alert-dialog>`, `<mz-drawer>`, `<mz-popover>`, `<mz-tooltip>`, `<mz-dropdown>`

**Navigation**: `<mz-tab-group>` + `<mz-tab-panel>`, `<mz-pagination>`, `<mz-breadcrumb>`

**Layout**: `<mz-accordion>`, `<mz-button-group>`, `<mz-divider>`, `<mz-stack>`, `<mz-split-panel>`

**Scheduling**: `<mz-calendar>` — full calendar with day/week/month/resource views, events, drag-to-select

**Charts**: `<mz-chart>` — Chart.js wrapper (bar/line/pie/doughnut/radar/scatter)

### Component Conventions

- Events: `mz-change`, `mz-input`, `mz-select`, `mz-close`, etc.
- Sizes: `sm` / `md` / `lg` (some use `small` / `medium` / `large`)
- Variants: `primary`, `danger`, `success`, `warning`, `neutral`
- Appearances: `filled`, `outline`, `soft`, `ghost`, `link`
- CSS custom props: `--mz-*` namespace
- CSS parts: `::part(base)`, `::part(input)`, etc.
- Form participation via ElementInternals
- Design tokens in `manzano.css` (light/dark modes)
- Font: Plus Jakarta Sans

### Scheduling Components

**`<mz-date-picker>`**: Text input + calendar dropdown. Attrs: `value` (ISO), `min`, `max`, `placeholder`, `disabled`, `size`, `first-day-of-week`, `locale`. Events: `mz-change`, `mz-clear`.

**`<mz-date-range-picker>`**: Dual-month calendar for date ranges. Attrs: `start-date`, `end-date`, `min`, `max`, `inline`, `show-presets`, `first-day-of-week`. Events: `mz-range-change`.

**`<mz-calendar>`**: Full scheduling calendar. Views: `timeGridWeek`, `timeGridDay`, `dayGridMonth`, `resourceTimeGridDay`. Attrs: `view`, `date`, `slot-duration`, `slot-min-time`, `slot-max-time`, `selectable`, `editable`, `now-indicator`, `first-day`. Props: `.events`, `.resources`. Methods: `prev()`, `next()`, `today()`, `gotoDate()`, `addEvent()`, `updateEvent()`, `removeEvent()`. Events: `mz-calendar-event-click`, `mz-calendar-select`, `mz-calendar-event-drop`.

## Canonical Reference

The canonical scheduling implementation is at `../../freemodel/spacelift/`. Key patterns to mimic:
- Availability query → slot selection → booking creation → return/reschedule
- Slot reservation (temporary lock) before booking
- Timezone-aware display
- Rescheduling with original booking link preserved
- Lead/participant tracking on bookings
