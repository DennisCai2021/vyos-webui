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
echo "[1/6] 检查前端构建..."
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

# 创建SSH命令
SSH_CMD="sshpass -p $VYOS_PASS ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $VYOS_USER@$VYOS_HOST"
SCP_CMD="sshpass -p $VYOS_PASS scp -o StrictHostKeyChecking=no -o ConnectTimeout=10"

# 1. 创建目标目录
echo ""
echo "[2/6] 创建远程目录..."
$SSH_CMD "sudo mkdir -p $REMOTE_DIR && sudo chown -R $VYOS_USER:users $REMOTE_DIR"

# 2. 创建传输归档
echo ""
echo "[3/6] 打包文件..."
TMP_TAR="/tmp/vyos-webui-$(date +%Y%m%d%H%M%S).tar.gz"
tar -czf "$TMP_TAR" \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='node_modules' \
    --exclude='venv' \
    --exclude='.env' \
    --exclude='.claude' \
    --exclude='*.log' \
    --exclude='nohup.out' \
    --exclude='backend/site-packages' \
    backend/ frontend/dist/ README.md DEPLOY.md

echo "已创建: $TMP_TAR"

# 3. 传输文件
echo ""
echo "[4/6] 传输文件到VyOS..."
$SCP_CMD "$TMP_TAR" "$VYOS_USER@$VYOS_HOST:/tmp/"

# 4. 解压文件
echo ""
echo "[5/6] 解压文件..."
$SSH_CMD "cd $REMOTE_DIR && tar -xzf /tmp/$(basename "$TMP_TAR") && rm -f /tmp/$(basename "$TMP_TAR")"

# 5. 在VyOS上设置环境并启动
echo ""
echo "[6/6] 在VyOS上配置并启动服务..."

# 创建远程安装脚本
cat << 'REMOTE_SCRIPT' > /tmp/vyos_install.sh
#!/bin/bash
set -e

REMOTE_DIR="/opt/vyos-webui"
cd "$REMOTE_DIR"

echo "步骤 1/5: 安装系统依赖..."
sudo apt-get update
sudo apt-get install -y python3-venv python3-pip python3-dev gcc

echo ""
echo "步骤 2/5: 创建Python虚拟环境..."
cd backend
rm -rf venv
python3 -m venv venv

echo ""
echo "步骤 3/5: 安装Python依赖..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "步骤 4/5: 创建环境配置..."
cat > .env << 'EOF'
VYOS_HOST=127.0.0.1
VYOS_PORT=22
VYOS_USERNAME=vyos
VYOS_PASSWORD=vyos
VYOS_TIMEOUT=30
EOF

echo ""
echo "步骤 5/5: 创建启动和停止脚本..."
cd ..

# 启动脚本
cat > start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"

# 停止旧进程
pkill -f 'uvicorn.*main:app' 2>/dev/null || true
pkill -f 'python.*-m http.server' 2>/dev/null || true
sleep 1

echo "启动 VyOS Web UI..."

# 启动后端
echo "  启动后端..."
cd backend
source venv/bin/activate
nohup python -m uvicorn main:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!

# 启动前端
echo "  启动前端..."
cd ../frontend/dist
nohup python3 -m http.server 5173 --bind 0.0.0.0 > ../../frontend.log 2>&1 &
FRONTEND_PID=$!

cd ../..

echo ""
echo "========================================="
echo "  启动完成！"
echo "========================================="
echo "后端 PID: $BACKEND_PID"
echo "前端 PID: $FRONTEND_PID"
echo ""
echo "访问地址: http://$(hostname -I | awk '{print $1}'):5173"
echo "后端 API: http://$(hostname -I | awk '{print $1}'):8000"
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
echo "完成"
EOF

# 查看状态脚本
cat > status.sh << 'EOF'
#!/bin/bash
echo "VyOS Web UI 状态:"
echo ""
if pgrep -f 'uvicorn.*main:app' > /dev/null; then
    echo "后端: 运行中 (PID: $(pgrep -f 'uvicorn.*main:app'))"
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
echo "正在启动服务..."
./start.sh

REMOTE_SCRIPT

# 传输并执行远程安装脚本
chmod +x /tmp/vyos_install.sh
$SCP_CMD /tmp/vyos_install.sh "$VYOS_USER@$VYOS_HOST:/tmp/"
$SSH_CMD "chmod +x /tmp/vyos_install.sh && sudo /tmp/vyos_install.sh"

# 清理本地临时文件
rm -f "$TMP_TAR" /tmp/vyos_install.sh

echo ""
echo "========================================="
echo "  部署完成！"
echo "========================================="
echo ""
echo "访问地址: http://$VYOS_HOST:5173"
echo "后端 API: http://$VYOS_HOST:8000"
echo ""
echo "默认登录: vyos / vyos"
echo ""
echo "VyOS上的管理命令:"
echo "  启动: cd $REMOTE_DIR && ./start.sh"
echo "  停止: cd $REMOTE_DIR && ./stop.sh"
echo "  状态: cd $REMOTE_DIR && ./status.sh"
echo "  日志: tail -f $REMOTE_DIR/backend.log"
echo ""
