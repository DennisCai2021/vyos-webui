#!/bin/bash
# VyOS Web UI 一键部署脚本
# 使用方法: ./scripts/deploy.sh [VyOS主机IP] [VyOS用户名] [VyOS密码]

set -e

# 默认配置
VYOS_HOST="${1:-198.18.5.188}"
VYOS_USER="${2:-vyos}"
VYOS_PASS="${3:-vyos}"
REMOTE_DIR="/opt/vyos-webui"

echo "========================================="
echo "  VyOS Web UI 一键部署"
echo "========================================="
echo "目标主机: $VYOS_HOST"
echo "用户名: $VYOS_USER"
echo ""

# 检查必要工具
check_tool() {
    if ! command -v "$1" &> /dev/null; then
        echo "错误: 缺少必需工具 $1"
        exit 1
    fi
}

check_tool sshpass
check_tool ssh
check_tool scp
check_tool tar

# 构建前端（如果需要）
echo "[1/7] 检查前端构建..."
cd "$(dirname "$0")/.."
if [ ! -d "frontend/dist" ] || [ -z "$(ls -A frontend/dist)" ]; then
    echo "前端未构建，正在构建..."
    cd frontend
    if ! npm run build; then
        echo "错误: 前端构建失败"
        exit 1
    fi
    cd ..
else
    echo "前端已构建，跳过"
fi

# 创建可移植的Python环境
echo ""
echo "[2/7] 准备可移植Python环境..."
cd backend
if [ ! -d "venv" ]; then
    echo "创建本地venv..."
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

# 创建一个可移植的启动脚本
cat > venv/bin/python_portable << 'PYEOF'
#!/bin/bash
# 可移植Python启动器
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONHOME="$DIR/.."
export PYTHONPATH="$DIR/../lib/python3.12/site-packages:$PYTHONPATH"
exec /usr/bin/python3 "$@"
PYEOF
chmod +x venv/bin/python_portable

echo "Python依赖已就绪"
cd ..

# 创建SSH命令
SSH_CMD="sshpass -p $VYOS_PASS ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $VYOS_USER@$VYOS_HOST"
SCP_CMD="sshpass -p $VYOS_PASS scp -o StrictHostKeyChecking=no -o ConnectTimeout=10"

# 1. 创建目标目录
echo ""
echo "[3/7] 创建远程目录..."
$SSH_CMD "sudo mkdir -p $REMOTE_DIR && sudo chown -R $VYOS_USER:users $REMOTE_DIR"

# 2. 创建传输归档
echo ""
echo "[4/7] 打包文件..."
TMP_TAR="/tmp/vyos-webui-$(date +%Y%m%d%H%M%S).tar.gz"
tar -czf "$TMP_TAR" \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='node_modules' \
    --exclude='.env' \
    --exclude='.claude' \
    --exclude='*.log' \
    --exclude='nohup.out' \
    backend/ frontend/dist/ README.md DEPLOY.md

echo "已创建: $TMP_TAR"

# 3. 传输文件
echo ""
echo "[5/7] 传输文件到VyOS..."
$SCP_CMD "$TMP_TAR" "$VYOS_USER@$VYOS_HOST:/tmp/"

# 4. 解压文件
echo ""
echo "[6/7] 解压文件..."
$SSH_CMD "cd $REMOTE_DIR && tar -xzf /tmp/$(basename "$TMP_TAR") && rm -f /tmp/$(basename "$TMP_TAR")"

# 5. 在VyOS上设置环境并启动
echo ""
echo "[7/7] 在VyOS上配置并启动服务..."

# 创建远程安装脚本
cat << 'REMOTE_SCRIPT' > /tmp/vyos_install.sh
#!/bin/bash
set +e

REMOTE_DIR="/opt/vyos-webui"
cd "$REMOTE_DIR"

echo "步骤 1/4: 创建环境配置..."
cd backend
cat > .env << 'EOF'
VYOS_HOST=127.0.0.1
VYOS_PORT=22
VYOS_USERNAME=vyos
VYOS_PASSWORD=vyos
VYOS_TIMEOUT=30
EOF

# 修复venv（如果存在）
if [ -d "venv" ]; then
    echo "  修复venv配置..."
    # 更新pyvenv.cfg
    cat > venv/pyvenv.cfg << 'CFGEOF'
home = /usr/bin
include-system-site-packages = false
version = 3.11.2
CFGEOF
    # 修复符号链接
    cd venv/bin
    rm -f python python3 python3.12
    ln -s /usr/bin/python3 python
    ln -s /usr/bin/python3 python3
    cd ../..
fi

echo ""
echo "步骤 2/4: 创建启动和停止脚本..."
cd ..

# 启动脚本
cat > start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"

# 停止旧进程
pkill -f 'uvicorn.*main:app' 2>/dev/null || true
pkill -f 'python.*-m http.server' 2>/dev/null || true
pkill -f 'python.*backend/main.py' 2>/dev/null || true
sleep 1

echo "启动 VyOS Web UI..."

# 启动后端
echo "  启动后端..."
cd backend

# 设置PYTHONPATH
if [ -d "venv/lib/python3.12/site-packages" ]; then
    export PYTHONPATH="$(pwd)/venv/lib/python3.12/site-packages:$(pwd)/venv/lib/python3.11/site-packages:$PYTHONPATH"
elif [ -d "venv/lib/python3.11/site-packages" ]; then
    export PYTHONPATH="$(pwd)/venv/lib/python3.11/site-packages:$PYTHONPATH"
fi

# 尝试多种方式启动
if [ -f "venv/bin/uvicorn" ]; then
    echo "    方式1: 使用venv uvicorn..."
    sed -i '1s|.*|#!/usr/bin/python3|' venv/bin/uvicorn 2>/dev/null || true
    python3 venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
elif python3 -c "import uvicorn" 2>/dev/null; then
    echo "    方式2: 使用系统uvicorn..."
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
else
    echo "    方式3: 尝试直接运行..."
    cat > run_backend.py << 'PYEND'
#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 尝试添加site-packages
for p in ['venv/lib/python3.12/site-packages', 'venv/lib/python3.11/site-packages']:
    sp = os.path.join(os.path.dirname(os.path.abspath(__file__)), p)
    if os.path.exists(sp):
        sys.path.insert(0, sp)

try:
    import uvicorn
    from main import app
    uvicorn.run(app, host="0.0.0.0", port=8000)
except ImportError as e:
    print(f"错误: {e}")
    print("")
    print("Python依赖未安装，推荐方案：")
    print("1. 在部署机运行前后端服务")
    print("2. 用SSH端口转发访问：")
    print("   ssh -L 5173:localhost:5173 -L 8000:localhost:8000 vyos@<this-ip>")
    print("3. 然后浏览器访问: http://localhost:5173")
    sys.exit(1)
PYEND
    chmod +x run_backend.py
    python3 run_backend.py > ../backend.log 2>&1 &
fi
BACKEND_PID=$!

# 启动前端
echo "  启动前端..."
cd ../frontend/dist
python3 -m http.server 5173 --bind 0.0.0.0 > ../../frontend.log 2>&1 &
FRONTEND_PID=$!

cd ../..

sleep 3

echo ""
echo "========================================="
echo "  启动尝试完成！"
echo "========================================="
echo "后端 PID: $BACKEND_PID"
echo "前端 PID: $FRONTEND_PID"
echo ""
# 获取本机IP
MY_IP=$(ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)
if [ -z "$MY_IP" ]; then
    MY_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [ -z "$MY_IP" ]; then
    MY_IP="your-vyos-ip"
fi

# 检查后端是否真的在运行
if ps -p $BACKEND_PID > /dev/null; then
    echo "后端: 运行中"
else
    echo "后端: 启动失败，请查看日志"
fi
if ps -p $FRONTEND_PID > /dev/null; then
    echo "前端: 运行中"
else
    echo "前端: 启动失败，请查看日志"
fi

echo ""
echo "如果后端无法在VyOS上运行，推荐方案："
echo "  1. 在部署机运行前后端服务"
echo "  2. 用SSH端口转发访问："
echo "     ssh -L 5173:localhost:5173 -L 8000:localhost:8000 vyos@$MY_IP"
echo "  3. 然后浏览器访问: http://localhost:5173"
echo ""
echo "默认登录: vyos / vyos"
echo ""
echo "查看日志:"
echo "  后端: tail -f backend.log"
echo "  前端: tail -f frontend.log"
EOF

# 停止脚本
cat > stop.sh << 'EOF'
#!/bin/bash
echo "停止 VyOS Web UI..."
pkill -f 'uvicorn.*main:app' 2>/dev/null && echo "  后端已停止" || echo "  后端未运行"
pkill -f 'python.*-m http.server' 2>/dev/null && echo "  前端已停止" || echo "  前端未运行"
pkill -f 'python.*backend/main.py' 2>/dev/null
pkill -f 'python.*run_backend.py' 2>/dev/null
echo "完成"
EOF

# 查看状态脚本
cat > status.sh << 'EOF'
#!/bin/bash
echo "VyOS Web UI 状态:"
echo ""
if pgrep -f 'uvicorn.*main:app' > /dev/null; then
    echo "后端: 运行中 (PID: $(pgrep -f 'uvicorn.*main:app'))"
elif pgrep -f 'python.*run_backend.py' > /dev/null; then
    echo "后端: 运行中 (PID: $(pgrep -f 'python.*run_backend.py'))"
else
    echo "后端: 未运行"
fi
if pgrep -f 'python.*-m http.server' > /dev/null; then
    echo "前端: 运行中 (PID: $(pgrep -f 'python.*-m http.server'))"
else
    echo "前端: 未运行"
fi
echo ""
if ss -tlnp 2>/dev/null | grep -q ':5173'; then
    echo "端口 5173: 已监听"
fi
if ss -tlnp 2>/dev/null | grep -q ':8000'; then
    echo "端口 8000: 已监听"
fi
EOF

chmod +x start.sh stop.sh status.sh

echo ""
echo "步骤 3/4: 尝试启动服务..."
./start.sh

echo ""
echo "步骤 4/4: 部署完成！"
echo ""
echo "如果VyOS上的后端无法运行（由于Python依赖问题），"
echo "请使用部署机运行服务+SSH端口转发的方式。"

REMOTE_SCRIPT

# 传输并执行远程安装脚本
chmod +x /tmp/vyos_install.sh
$SCP_CMD /tmp/vyos_install.sh "$VYOS_USER@$VYOS_HOST:/tmp/"
$SSH_CMD "chmod +x /tmp/vyos_install.sh && /tmp/vyos_install.sh" || true

# 清理本地临时文件
rm -f "$TMP_TAR" /tmp/vyos_install.sh

echo ""
echo "========================================="
echo "  部署脚本执行完成！"
echo "========================================="
echo ""
echo "文件已部署到: $REMOTE_DIR"
echo ""
echo "请查看上面的输出，如果VyOS上的后端无法运行，"
echo "推荐使用部署机运行服务，然后用SSH端口转发访问："
echo ""
echo "  ssh -L 5173:localhost:5173 -L 8000:localhost:8000 $VYOS_USER@$VYOS_HOST"
echo "  浏览器访问: http://localhost:5173"
echo ""
echo "VyOS上的管理命令:"
echo "  启动: cd $REMOTE_DIR && ./start.sh"
echo "  停止: cd $REMOTE_DIR && ./stop.sh"
echo "  状态: cd $REMOTE_DIR && ./status.sh"
echo "  日志: tail -f $REMOTE_DIR/backend.log"
echo ""
