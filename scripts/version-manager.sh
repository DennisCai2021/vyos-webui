#!/bin/bash
# Version Management Script for VyOS WebUI

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

VERSION_FILE="$PROJECT_ROOT/VERSION"

get_version() {
    if [ -f "$VERSION_FILE" ]; then
        cat "$VERSION_FILE"
    else
        echo "1.0.0"
    fi
}

set_version() {
    local version=$1
    echo "$version" > "$VERSION_FILE"
    echo "Version set to: $version"
}

bump_major() {
    local current=$(get_version)
    local major=$(echo "$current" | cut -d. -f1)
    local minor=$(echo "$current" | cut -d. -f2)
    local patch=$(echo "$current" | cut -d. -f3)
    local new_major=$((major + 1))
    set_version "$new_major.0.0"
}

bump_minor() {
    local current=$(get_version)
    local major=$(echo "$current" | cut -d. -f1)
    local minor=$(echo "$current" | cut -d. -f2)
    local patch=$(echo "$current" | cut -d. -f3)
    local new_minor=$((minor + 1))
    set_version "$major.$new_minor.0"
}

bump_patch() {
    local current=$(get_version)
    local major=$(echo "$current" | cut -d. -f1)
    local minor=$(echo "$current" | cut -d. -f2)
    local patch=$(echo "$current" | cut -d. -f3)
    local new_patch=$((patch + 1))
    set_version "$major.$minor.$new_patch"
}

case "${1:-}" in
    get)
        get_version
        ;;
    set)
        if [ -z "${2:-}" ]; then
            echo "Usage: $0 set <version>"
            exit 1
        fi
        set_version "$2"
        ;;
    major)
        bump_major
        ;;
    minor)
        bump_minor
        ;;
    patch)
        bump_patch
        ;;
    *)
        echo "Version Management Tool"
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  get          - Show current version"
        echo "  set <ver>    - Set specific version"
        echo "  major        - Bump major version (X+1.0.0)"
        echo "  minor        - Bump minor version (X.Y+1.0)"
        echo "  patch        - Bump patch version (X.Y.Z+1)"
        ;;
esac
