#!/bin/sh
# Blocks a commit if a staged change looks like it contains a Google API key
# or a real GEMINI_API_KEY value. Installed as .git/hooks/pre-commit.
added=$(git diff --cached -U0 | grep -E '^\+' | grep -vE '^\+\+\+ ')

if printf '%s\n' "$added" | grep -qE 'AIza[0-9A-Za-z_-]{30,}'; then
  echo "BLOCKED: staged changes contain something that looks like a Google API key." >&2
  exit 1
fi
# A real value = 20+ key characters right after "GEMINI_API_KEY=" (placeholders and docs are fine).
if printf '%s\n' "$added" | grep -E 'GEMINI_API_KEY[[:space:]]*=[[:space:]]*["'\'']?[A-Za-z0-9_-]{20,}' | grep -vq 'your-gemini-api-key-here'; then
  echo "BLOCKED: staged changes set GEMINI_API_KEY to a real-looking value." >&2
  exit 1
fi
for f in $(git diff --cached --name-only); do
  case "$f" in
    .env|.env.local|*/.env|*.env.local|.env.*.local) echo "BLOCKED: $f must never be committed." >&2; exit 1;;
  esac
done
exit 0
