# Contributing Guidelines

Welcome to the contributor guide for this repository. We follow a strict Git Flow branch model to ensure predictable, high-quality releases and hotfixes.

## Branch Roles & Git Flow Operating Rules

Our repository uses two permanent branches and three types of temporary branches:

### Permanent Branches

1. **`main`**: The production-ready branch. All code in `main` is deployable and reflects the current state of production.
2. **`develop`**: The integration branch. All upcoming features are integrated here before they are part of a release.

### Temporary Branches

1. **Feature Branches (`feature/*`)**
   - **Created from:** `develop`
   - **Merges back into:** `develop`
   - **Purpose:** Used to develop new features for upcoming or distant releases.
   - **Naming example:** `feature/user-authentication`, `feature/issue-123-login-bug`

2. **Release Branches (`release/*`)**
   - **Created from:** `develop`
   - **Merges back into:** `main` and then back-merged to `develop`
   - **Purpose:** Supports preparation of a new production release. Allows for minor bug fixes and preparing meta-data for a release.
   - **Naming example:** `release/1.2.0`, `release/v2.0`

3. **Hotfix Branches (`hotfix/*`)**
   - **Created from:** `main`
   - **Merges back into:** `main` and then synced to `develop`
   - **Purpose:** Arise from the necessity to act immediately upon an undesired state of a live production version.
   - **Naming example:** `hotfix/1.2.1-login-crash`

## Pull Request Base Branch Selection

When submitting a pull request, ensure you target the correct base branch:

- **For feature branches:** Set the base branch to `develop`.
- **For release branches:** First PR targets `main`. After merging to `main`, a subsequent PR or merge must bring those changes back into `develop`.
- **For hotfix branches:** First PR targets `main`. After merging to `main`, a sync PR must bring the hotfix back to `develop`.

## Commit Conventions

We enforce strictly formulated commit messages. Please adhere to the [Conventional Commits](https://www.conventionalcommits.org/) standard.

Example commit message:
\`\`\`
feat(auth): add JWT generation for user login
\`\`\`
