#!/bin/bash
# VyOS Web UI - 在 VyOS 上直接运行的部署脚本
# 使用方法: 在 VyOS 上执行: bash deploy-on-vyos.sh
#
# 首次安装:
#   curl -O https://raw.githubusercontent.com/DennisCai2021/vyos-webui/main/scripts/deploy-on-vyos.sh
#   chmod +x deploy-on-vyos.sh
#   ./deploy-on-vyos.sh

set -e

# 配置
REPO_URL="https://github.com/DennisCai2021/vyos-webui.git"
INSTALL_DIR="/opt/vyos-webui"
VYOS_USER="vyos"

echo "========================================="
echo "  VyOS Web UI - 本地部署脚本"
echo "========================================="
echo ""

# 检查必要工具
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        echo "错误: 缺少必需工具 $1"
        exit 1
    fi
}

check_tool git
check_tool python3

# 1. 停止旧服务
echo "[1/5] 停止旧服务..."
if [ -d "$INSTALL_DIR" ]; then
    cd "$INSTALL_DIR"
    if [ -f "./stop.sh" ]; then
        ./stop.sh 2>/dev/null || true
    fi
    cd /
fi

# 2. 创建/更新代码
echo ""
echo "[2/5] 从 GitHub 拉取最新代码..."

if [ -d "$INSTALL_DIR/.git" ]; then
    # 已存在，更新
    echo "检测到已安装，正在更新..."
    cd "$INSTALL_DIR"
    git fetch origin
    git reset --hard origin/main
    git clean -fd
else
    # 新安装
    echo "新安装，正在克隆仓库..."
    sudo rm -rf "$INSTALL_DIR"
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown -R "$VYOS_USER:users" "$INSTALL_DIR"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
echo "当前版本: $(git log -1 --oneline)"

# 3. 准备 Python 环境
echo ""
echo "[3/5] 准备 Python 环境..."
cd "$INSTALL_DIR/backend"

# 创建 venv（不使用 pip）
if [ ! -d "venv" ]; then
    echo "创建 Python venv..."
    python3 -m venv venv --without-pip 2>/dev/null || python3 -m venv venv
fi

# 修复 venv 配置
echo "修复 venv 配置..."
cat > venv/pyvenv.cfg << 'CFGEOF'
home = /usr/bin
include-system-site-packages = true
version = 3.11.2
CFGEOF

# 修复符号链接
cd venv/bin
rm -f python python3 python3.11 python3.12
ln -sf /usr/bin/python3 python
ln -sf /usr/bin/python3 python3
if [ -x /usr/bin/python3.11 ]; then
    ln -sf /usr/bin/python3.11 python3.11
fi

cd ../..

# 尝试安装 pip
echo "检查 pip..."
if ! ./venv/bin/python3 -m pip --version 2>/dev/null; then
    echo "安装 pip..."
    curl -sSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
    ./venv/bin/python3 /tmp/get-pip.py 2>/dev/null || true
fi

# 安装依赖
echo "安装 Python 依赖..."
./venv/bin/python3 -m pip install -q -r requirements.txt 2>/dev/null || \
./venv/bin/python3 -m pip install -q --break-system-packages -r requirements.txt 2>/dev/null || \
echo "警告: 依赖安装可能不完全，尝试继续..."

# 创建 .env 文件
echo "创建环境配置..."
cat > .env << 'EOF'
VYOS_HOST=127.0.0.1
VYOS_PORT=22
VYOS_USERNAME=vyos
VYOS_PASSWORD=vyos
VYOS_TIMEOUT=30
EOF

# 4. 检查前端
echo ""
echo "[4/5] 检查前端..."
cd "$INSTALL_DIR"

if [ ! -d "frontend/dist" ] || [ -z "$(ls -A frontend/dist 2>/dev/null)" ]; then
    echo ""
    echo "========================================="
    echo "  错误: 前端未找到!"
    echo "========================================="
    echo ""
    echo "请确保 GitHub 仓库包含 frontend/dist 目录"
    echo ""
    exit 1
fi

echo "前端已就绪"

# 5. 创建启动/停止脚本并启动
echo ""
echo "[5/5] 创建管理脚本并启动服务..."

# 启动脚本
cat > "$INSTALL_DIR/start.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"

# 停止旧进程
pkill -f 'uvicorn.*main:app' 2>/dev/null || true
pkill -f 'python.*backend/main.py' 2>/dev/null || true
pkill -f 'python.*run_backend.py' 2>/dev/null || true
sleep 1

echo "启动 VyOS Web UI..."

# 启动后端（同时提供前端静态文件）
echo "  启动后端（含前端服务）..."
cd backend

# 尝试启动
BACKEND_PID=""
if [ -f "venv/bin/python3" ]; then
    echo "    使用 venv..."
    venv/bin/python3 -c "import uvicorn" 2>/dev/null || venv/bin/python3 -m pip install -q uvicorn fastapi loguru jose paramiko 2>/dev/null || true
    venv/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
    BACKEND_PID=$!
elif python3 -c "import uvicorn" 2>/dev/null; then
    echo "    使用系统 Python..."
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
    BACKEND_PID=$!
else
    echo "    创建启动脚本..."
    cat > run_backend.py << 'PYEND'
#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import uvicorn
    from main import app
    uvicorn.run(app, host="0.0.0.0", port=8000)
except ImportError as e:
    print(f"错误: {e}")
    sys.exit(1)
PYEND
    chmod +x run_backend.py
    python3 run_backend.py > ../backend.log 2>&1 &
    BACKEND_PID=$!
fi

cd ..

sleep 3

echo ""
echo "========================================="
echo "  启动尝试完成！"
echo "========================================="
echo "后端 PID: $BACKEND_PID"
echo ""

# 获取本机 IP
MY_IP=$(ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)
if [ -z "$MY_IP" ]; then
    MY_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "$MY_IP" ]; then
    MY_IP="your-vyos-ip"
fi

# 检查后端是否真的在运行
if [ -n "$BACKEND_PID" ] && ps -p $BACKEND_PID > /dev/null; then
    echo "服务: 运行中"
    echo ""
    echo "访问地址: http://$MY_IP:8000"
    echo ""
    echo "默认登录: vyos / vyos"
else
    echo "服务: 启动失败，请查看日志"
fi

echo ""
echo "查看日志:"
echo "  tail -f backend.log"
EOF

# 停止脚本
cat > "$INSTALL_DIR/stop.sh" << 'EOF'
#!/bin/bash
echo "停止 VyOS Web UI..."
pkill -f 'uvicorn.*main:app' 2>/dev/null && echo "  服务已停止" || echo "  服务未运行"
pkill -f 'python.*backend/main.py' 2>/dev/null
pkill -f 'python.*run_backend.py' 2>/dev/null
echo "完成"
EOF

# 状态脚本
cat > "$INSTALL_DIR/status.sh" << 'EOF'
#!/bin/bash
echo "VyOS Web UI 状态:"
echo ""
if pgrep -f 'uvicorn.*main:app' > /dev/null; then
    echo "服务: 运行中 (PID: $(pgrep -f 'uvicorn.*main:app'))"
elif pgrep -f 'python.*run_backend.py' > /dev/null; then
    echo "服务: 运行中 (PID: $(pgrep -f 'python.*run_backend.py'))"
else
    echo "服务: 未运行"
fi
echo ""
if ss -tlnp 2>/dev/null | grep -q ':8000'; then
    echo "端口 8000: 已监听"
fi
echo ""
# 获取本机 IP
MY_IP=$(ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)
if [ -z "$MY_IP" ]; then
    MY_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -n "$MY_IP" ]; then
    echo "访问地址: http://$MY_IP:8000"
fi
EOF

chmod +x "$INSTALL_DIR/start.sh" "$INSTALL_DIR/stop.sh" "$INSTALL_DIR/status.sh"

# 启动服务
echo ""
echo "启动服务..."
cd "$INSTALL_DIR"
./start.sh

echo ""
echo "========================================="
echo "  部署完成！"
echo "========================================="
echo ""
echo "安装目录: $INSTALL_DIR"
echo ""
echo "管理命令:"
echo "  启动: cd $INSTALL_DIR && ./start.sh"
echo "  停止: cd $INSTALL_DIR && ./stop.sh"
echo "  状态: cd $INSTALL_DIR && ./status.sh"
echo "  日志: tail -f $INSTALL_DIR/backend.log"
echo ""
echo "更新到最新版本:"
echo "  cd $INSTALL_DIR && ./stop.sh"
echo "  然后重新运行此脚本"
echo ""
