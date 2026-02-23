#!/bin/bash
# Build VyOS Web UI offline Debian package for VyOS 1.4 (Python 3.11)

set -e

cd "$(dirname "$0")/.."
PROJECT_DIR=$(pwd)

echo "========================================="
echo "  VyOS Web UI - 构建离线 DEB 包"
echo "========================================="
echo ""

# Check required tools
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        echo "错误: 缺少必需工具 $1"
        echo "请安装: sudo apt install $2"
        exit 1
    fi
}

check_tool dpkg-buildpackage dpkg-dev
check_tool debhelper debhelper
check_tool python3.11 python3.11
check_tool npm nodejs
check_tool pip3 python3-pip

echo "[1/5] 检查前端构建..."
cd "$PROJECT_DIR/frontend"
if [ ! -d "dist" ] || [ -z "$(ls -A dist 2>/dev/null)" ]; then
    echo "  构建前端..."
    npm install
    npm run build
else
    echo "  前端已构建，跳过"
fi

echo ""
echo "[2/5] 下载 Python 依赖包（用于离线安装）..."
cd "$PROJECT_DIR/backend"
mkdir -p vendor 2>/dev/null || true
rm -rf vendor/*
pip3.11 download -d vendor -r requirements.txt
echo "  已下载 $(ls -1 vendor | wc -l) 个包"

echo ""
echo "[3/5] 清理先前的构建..."
cd "$PROJECT_DIR"
rm -f ../vyos-webui_*.deb ../vyos-webui_*.buildinfo ../vyos-webui_*.changes ../vyos-webui_*.dsc ../vyos-webui_*.tar.gz

echo ""
echo "[4/5] 构建 DEB 包..."
dpkg-buildpackage -us -uc -b

echo ""
echo "[5/5] 完成！"
echo ""
DEB_FILE=$(ls -1 ../vyos-webui_*.deb 2>/dev/null | tail -1)
if [ -n "$DEB_FILE" ]; then
    echo "DEB 包位置: $DEB_FILE"
    echo ""
    echo "在 VyOS 1.4 上安装:"
    echo "  1. 复制到 VyOS: scp $DEB_FILE vyos@<vyos-ip>:/tmp/"
    echo "  2. 在 VyOS 上安装: sudo dpkg -i /tmp/$(basename "$DEB_FILE")"
    echo "  3. 启动服务: sudo systemctl start vyos-webui"
fi
