#!/bin/sh
# Point git at the repo's hooks (.githooks/pre-commit runs gitleaks).
cd "$(dirname "$0")/.." && git config core.hooksPath .githooks && echo "git hooks enabled (.githooks)"
