# Working on Tasks

This directory contains detailed task specifications for the email client MVP.

## Before You Start

Read these documents for context:

| Document | Purpose |
|----------|---------|
| [PLAN.md](../PLAN.md) | Overall roadmap, status, dependencies |
| [SPEC.md](../SPEC.md) | Product requirements |
| [MVP.md](../MVP.md) | MVP scope (what's in/out) |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Technical decisions, schemas, patterns |

## Picking Up a Task

1. **Check [PLAN.md](../PLAN.md)** for available tasks (🔴 status)
2. **Check dependencies** - ensure blocking tasks are complete (🟢)
3. **Read the task file** thoroughly before starting
4. **Update PLAN.md** - change status to 🟡 In Progress

## Task File Structure

Each task file contains:

- **Goal** - What you're trying to achieve
- **Context** - Background info and links to relevant docs
- **Requirements** - Specific things to implement
- **Acceptance Criteria** - How to know when you're done
- **Technical Notes** - Implementation hints
- **Files to Create/Modify** - Where code goes

## Completing a Task

1. Verify all acceptance criteria checkboxes
2. Test your implementation
3. Update the task file status to "Done"
4. Update PLAN.md status to 🟢
5. Note any follow-up work discovered

## Development Commands

```bash
cd email-app

# Start dev server
bun --bun run dev

# Add a shadcn component
bunx shadcn@latest add button

# Run the database schema script
bun run src/lib/db/schema.ts
```

## Conventions

- Follow patterns in [ARCHITECTURE.md](../ARCHITECTURE.md)
- Use existing code patterns when present
- Don't add features beyond what's specified in the task
- Keep changes focused on the task at hand

## Directory Structure

```
tasks/
├── README.md              # This file
├── milestone-1/           # Foundation tasks
├── milestone-2/           # Email reading tasks
├── milestone-3/           # Keyboard navigation tasks
├── milestone-4/           # Sync tasks
├── milestone-5/           # Multi-account tasks
└── milestone-6/           # Polish tasks
```
