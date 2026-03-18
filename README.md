# Spacelift

A proof-of-concept home improvement project management platform built with [Manzano Grove](https://manzano.dev). Spacelift connects homeowners, consultants, and contractors through a referral-based workflow.

## What is Manzano?

Manzano is a full-stack application framework. You define your data models, actions, and validations in `.grove` files, and Manzano handles the database, API, and server. The `manzano dev` command runs a local development server that hot-reloads as you edit.

## Prerequisites

Install the Manzano CLI via Homebrew:

```bash
brew install manzano-studio/tap/manzano
```

## Quick Start

1. **Start the dev server:**

   ```bash
   ./start-server.sh
   ```

   The server runs at `http://127.0.0.1:19555`.

2. **Seed test data** (in a second terminal):

   ```bash
   ./seed-data.sh
   ```

3. **Open a dashboard** in your browser. Spacelift has three role-based UIs, selected via the subdomain. Visit:

   | Role        | URL                                          |
   |-------------|----------------------------------------------|
   | Admin       | `http://admin.localhost:19555`                |
   | Consultant  | `http://consultant.localhost:19555`           |
   | Contractor  | `http://contractor.localhost:19555`           |

## Project Structure

```
poc-spacelift/
├── grove.toml            # Project config (project_id = "spacelift")
├── start-server.sh       # Start the dev server
├── seed-data.sh          # Populate test data via the API
├── modules/              # Business logic (Grove modules)
│   ├── user/             # User accounts (admin, consultant, contractor)
│   ├── organization/     # Contractor/consultant companies + verification
│   ├── project/          # Home improvement projects
│   ├── referral/         # Referral workflow (consultant → contractor)
│   └── invite/           # User invitations to join organizations
└── apps/                 # Frontend pages and API routes
    ├── admin/            # Admin dashboard
    ├── consultant/       # Consultant dashboard
    └── contractor/       # Contractor dashboard + onboarding
```

## Modules

Each module lives in `modules/<name>/module.grove` and defines a record type with fields, actions, validations, and events.

### User

Manages accounts with roles: **admin**, **consultant**, or **contractor**. Users can optionally belong to an organization.

### Organization

Represents a contracting or consulting business. Goes through a verification workflow: `invited` → `pending` → `verified`.

### Project

A home improvement project (kitchen, bathroom, addition, etc.) with homeowner contact info, address, and budget range. Projects are assigned to consultants and progress through: `new` → `in_progress` → `project_complete` → `closed`.

### Referral

The core workflow connecting projects to contractors. A consultant sends a referral to a contractor organization. The referral progresses through: `sent` → `viewed` → `accepted`/`declined` → `scheduled` → `connected`.

### Invite

Email invitations for new users to join an organization. States: `pending` → `accepted`.

## API

API routes are defined in `apps/<role>/api/<module>/route.grove` and follow the pattern:

```
POST /api/<module>:<action>
```

For example:

```bash
# Create a project (as admin)
curl -s -X POST http://admin.localhost:19555/api/project:create_project \
  -H "Content-Type: application/json" \
  -d '{"project_type": "kitchen", "homeowner_name": "John Smith", ...}'

# Send a referral (as consultant)
curl -s -X POST http://consultant.localhost:19555/api/referral:send_referral \
  -H "Content-Type: application/json" \
  -d '{"project_id": "...", "organization_id": "..."}'
```

## Secrets

Local development secrets (e.g., Mapbox token for maps) are stored in `.secrets.yaml`. This file is gitignored and not committed.
