#!/bin/bash
# VyOS WebUI Cleanup Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "Cleaning up VyOS WebUI build artifacts..."

# Remove Python cache
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true
find . -type f -name "*.pyo" -delete 2>/dev/null || true

# Remove pytest cache
rm -rf .pytest_cache/ 2>/dev/null || true
rm -rf backend/.pytest_cache/ 2>/dev/null || true

# Remove build artifacts
rm -rf build/ 2>/dev/null || true
rm -rf dist/ 2>/dev/null || true
rm -f *.deb 2>/dev/null || true
rm -f *.tar.gz 2>/dev/null || true
rm -f *.dsc 2>/dev/null || true
rm -f *.changes 2>/dev/null || true
rm -f *.buildinfo 2>/dev/null || true

# Remove Debian build artifacts
rm -rf debian/vyos-webui/ 2>/dev/null || true
rm -f debian/files 2>/dev/null || true
rm -f debian/*.substvars 2>/dev/null || true
rm -f debian/*.debhelper 2>/dev/null || true
rm -f debian/*.log 2>/dev/null || true

# Remove node_modules (keep if you want to preserve)
# rm -rf frontend/node_modules/ 2>/dev/null || true
# rm -rf frontend/dist/ 2>/dev/null || true

# Remove virtual environment
# rm -rf backend/venv/ 2>/dev/null || true

echo "Cleanup complete!"
