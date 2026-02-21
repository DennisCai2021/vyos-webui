#!/bin/bash
# VyOS WebUI Package Build Script
# Builds a Debian package for VyOS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VERSION=${1:-1.0.0}
RELEASE=${2:-1}

echo "=========================================="
echo "VyOS WebUI Package Build"
echo "Version: ${VERSION}-${RELEASE}"
echo "=========================================="

cd "$PROJECT_ROOT"

# Update changelog
echo "Updating changelog..."
DEBEMAIL="team@vyos-webui.local" DEBFULLNAME="VyOS WebUI Team" \
dch -v "${VERSION}-${RELEASE}" -D unstable "New upstream release"

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf build/ dist/ *.deb *.tar.gz *.dsc *.changes
dh_clean || true

# Build the package
echo "Building package..."
dpkg-buildpackage -us -uc -b

# Move output files
echo "Moving build artifacts..."
mkdir -p build
mv ../vyos-webui_*.deb ../vyos-webui_*.buildinfo ../vyos-webui_*.changes build/ 2>/dev/null || true

echo "=========================================="
echo "Build complete!"
echo "Output in: $(pwd)/build/"
echo "=========================================="
ls -la build/
