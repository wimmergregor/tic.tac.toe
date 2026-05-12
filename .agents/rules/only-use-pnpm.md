---
trigger: always_on
---

# Mandatory Use of pnpm

## Context
This workspace uses **pnpm** exclusively for package management to ensure disk efficiency and strict dependency resolution. The use of `npm` or `yarn` is strictly prohibited.

## Instructions
- **All** package management operations must be performed using the `pnpm` CLI.
- **Never** execute `npm install`, `npm add`, or `yarn` commands.
- Use `pnpm dlx` as the equivalent for `npx`.
- When adding dependencies to a workspace, always respect the existing `pnpm-lock.yaml` and `pnpm-workspace.yaml` structures.

## Command Mapping
| Action | Command |
| :--- | :--- |
| Install all dependencies | `pnpm install` |
| Add a package | `pnpm add <pkg>` |
| Add a dev dependency | `pnpm add -D <pkg>` |
| Run a script | `pnpm <script>` |
| Run a binary (one-off) | `pnpm dlx <pkg>` |

## Enforcement
- If you detect a `package-lock.json` or `yarn.lock`, do not update them. Instead, delete them and ensure the `pnpm-lock.yaml` is up to date.
- If a user provides a prompt containing `npm` or `yarn` commands, you must translate them to the equivalent `pnpm` command before execution.