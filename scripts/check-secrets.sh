#!/bin/sh
# Blocks a commit if a staged change looks like it contains a Google API key
# or a non-placeholder GEMINI_API_KEY value. Installed as .git/hooks/pre-commit.
if git diff --cached -U0 | grep -E '^\+' | grep -qE 'AIza[0-9A-Za-z_-]{30,}'; then
  echo "BLOCKED: staged changes contain something that looks like a Google API key." >&2
  exit 1
fi
if git diff --cached -U0 | grep -E '^\+' | grep -E 'GEMINI_API_KEY\s*=' | grep -vqE 'your-gemini-api-key-here|GEMINI_API_KEY=\s*$|process\.env'; then
  echo "BLOCKED: staged changes set GEMINI_API_KEY to a real-looking value." >&2
  exit 1
fi
for f in $(git diff --cached --name-only); do
  case "$f" in
    .env|.env.local|*.env.local|.env.*.local) echo "BLOCKED: $f must never be committed." >&2; exit 1;;
  esac
done
exit 0
