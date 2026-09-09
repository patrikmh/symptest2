#!/usr/bin/env bash
# Scaffold a new project under projects/ from templates/project.
#
# Usage: ./scripts/new-project.sh <kebab-case-name>
set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "usage: $0 <kebab-case-name>" >&2
    exit 1
fi

name="$1"
if [[ ! "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo "error: project name must be kebab-case (e.g. my-project)" >&2
    exit 1
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="$root/templates/project"
target="$root/projects/$name"

if [[ -e "$target" ]]; then
    echo "error: $target already exists" >&2
    exit 1
fi

cp -R "$template" "$target"

# Substitute the placeholder in every copied text file. sed -i differs between
# GNU and BSD, so write to a temp file instead.
while IFS= read -r -d '' file; do
    tmp="$(mktemp)"
    sed "s/PROJECT_NAME/$name/g" "$file" > "$tmp"
    mv "$tmp" "$file"
done < <(find "$target" -type f -print0)

echo "Created projects/$name"
echo "Next: edit projects/$name/README.md and add a row to the Projects table in README.md"
