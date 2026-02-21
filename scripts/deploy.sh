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
echo "[1/5] 检查前端构建..."
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
echo "[2/5] 创建远程目录..."
$SSH_CMD "sudo mkdir -p $REMOTE_DIR && sudo chown -R $VYOS_USER:users $REMOTE_DIR"

# 2. 创建传输归档
echo ""
echo "[3/5] 打包文件..."
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
echo "[4/5] 传输文件到VyOS..."
$SCP_CMD "$TMP_TAR" "$VYOS_USER@$VYOS_HOST:/tmp/"

# 4. 解压文件
echo ""
echo "[5/5] 解压文件..."
$SSH_CMD "cd $REMOTE_DIR && tar -xzf /tmp/$(basename "$TMP_TAR") && rm -f /tmp/$(basename "$TMP_TAR")"

# 创建.env文件
$SSH_CMD "cat > $REMOTE_DIR/backend/.env << 'EOF'
VYOS_HOST=127.0.0.1
VYOS_PORT=22
VYOS_USERNAME=vyos
VYOS_PASSWORD=vyos
VYOS_TIMEOUT=30
EOF"

# 创建启动脚本（使用本机代理方式）
$SSH_CMD "cat > $REMOTE_DIR/start.sh << 'EOF'
#!/bin/bash
# VyOS Web UI 启动脚本
# 注意：由于VyOS上安装Python依赖较复杂，推荐使用部署机运行后端+前端，
# 或者使用SSH端口转发方式访问本机服务。

cd \"\$(dirname \"\$0\")\"

echo \"=========================================\"
echo \"  VyOS Web UI\"
echo \"=========================================\"
echo \"\"
echo \"选项1 - 使用SSH端口转发（推荐）：\"
echo \"  在你的本地机器运行：\"
echo \"    ssh -L 5173:localhost:5173 -L 8000:localhost:8000 vyos@$VYOS_HOST\"
echo \"  然后访问：http://localhost:5173\"
echo \"\"
echo \"选项2 - 仅启动前端（静态文件）：\"
echo \"  前端将在 http://$VYOS_HOST:5173 提供\"
echo \"  但需要修改前端API地址指向有后端服务的机器\"
echo \"\"
echo \"正在启动前端静态文件服务器...\"

# 停止旧进程
pkill -f \"python.*-m http.server\" 2>/dev/null || true

# 启动前端（仅静态文件）
cd frontend/dist
nohup python3 -m http.server 5173 --bind 0.0.0.0 > ../../frontend.log 2>&1 &
FRONTEND_PID=\$!

cd ../..

echo \"前端 PID: \$FRONTEND_PID\"
echo \"前端地址: http://$VYOS_HOST:5173\"
echo \"\"
echo \"查看日志: tail -f frontend.log\"
echo \"停止服务: pkill -f 'python.*-m http.server'\"
EOF"

$SSH_CMD "chmod +x $REMOTE_DIR/start.sh"

# 创建停止脚本
$SSH_CMD "cat > $REMOTE_DIR/stop.sh << 'EOF'
#!/bin/bash
# VyOS Web UI 停止脚本

echo \"停止 VyOS Web UI...\"
pkill -f \"uvicorn\" 2>/dev/null && echo \"后端已停止\" || echo \"后端未运行\"
pkill -f \"python.*-m http.server\" 2>/dev/null && echo \"前端已停止\" || echo \"前端未运行\"
echo \"完成\"
EOF"

$SSH_CMD "chmod +x $REMOTE_DIR/stop.sh"

# 清理本地临时文件
rm -f "$TMP_TAR"

echo ""
echo "========================================="
echo "  部署完成！"
echo "========================================="
echo ""
echo "文件已部署到: $REMOTE_DIR"
echo ""
echo "快速开始（推荐方式 - 使用本机服务）："
echo "  1. 确保本机的前后端服务正在运行"
echo "  2. 使用SSH端口转发："
echo "     ssh -L 5173:localhost:5173 -L 8000:localhost:8000 $VYOS_USER@$VYOS_HOST"
echo "  3. 在浏览器访问: http://localhost:5173"
echo ""
echo "或者在VyOS上仅启动前端静态文件："
echo "  ssh $VYOS_USER@$VYOS_HOST"
echo "  cd $REMOTE_DIR"
echo "  ./start.sh"
echo ""
echo "管理命令:"
echo "  停止: cd $REMOTE_DIR && ./stop.sh"
echo "  日志: tail -f $REMOTE_DIR/frontend.log"
echo ""
