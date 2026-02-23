#!/bin/bash
cd "$(dirname "$0")"

# 停止旧进程
pkill -f 'uvicorn.*main:app' 2>/dev/null || true
pkill -f 'python.*-m http.server' 2>/dev/null || true
pkill -f 'python.*backend/main.py' 2>/dev/null || true
pkill -f 'python.*run_backend.py' 2>/dev/null || true
sleep 1

echo "启动 VyOS Web UI..."

# 启动后端（同时提供前端静态文件）
echo "  启动后端（含前端服务）..."
cd backend

# 设置PYTHONPATH
export PYTHONPATH=""
if [ -d "venv/lib/python3.11/site-packages" ]; then
    export PYTHONPATH="$(pwd)/venv/lib/python3.11/site-packages:$PYTHONPATH"
fi
if [ -d "venv/lib/python3.12/site-packages" ]; then
    export PYTHONPATH="$(pwd)/venv/lib/python3.12/site-packages:$PYTHONPATH"
fi

# 尝试启动
BACKEND_PID=""
if [ -f "venv/bin/uvicorn" ]; then
    echo "    方式1: 使用venv uvicorn..."
    python3 venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
    BACKEND_PID=$!
elif python3 -c "import uvicorn" 2>/dev/null; then
    echo "    方式2: 使用系统uvicorn..."
    python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
    BACKEND_PID=$!
else
    echo "    方式3: 创建启动脚本..."
    cat > run_backend.py << 'PYEND'
#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 尝试添加site-packages
for p in ['venv/lib/python3.11/site-packages', 'venv/lib/python3.12/site-packages']:
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
    print("Python依赖有问题，请尝试以下方案：")
    print("1. 在部署机运行前后端服务")
    print("2. 用SSH端口转发访问")
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

# 检查后端是否真的在运行
if [ -n "$BACKEND_PID" ] && ps -p $BACKEND_PID > /dev/null; then
    echo "后端: 运行中"
    BACKEND_RUNNING=1
else
    echo "后端: 启动失败，请查看日志"
fi

echo ""
if [ $BACKEND_RUNNING -eq 1 ]; then
    # 获取本机IP
    MY_IP=$(ip -4 addr show 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127.0.0.1' | head -1)
    if [ -z "$MY_IP" ]; then
        MY_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    fi
    if [ -z "$MY_IP" ]; then
        MY_IP="your-vyos-ip"
    fi
    echo "访问地址: http://$MY_IP:8000"
    echo ""
    echo "默认登录: vyos / vyos"
else
    echo "后端无法在VyOS上运行，推荐方案："
    echo "  1. 在部署机运行前后端服务"
    echo "  2. 用SSH端口转发访问："
    echo "     ssh -L 8000:localhost:8000 vyos@$MY_IP"
    echo "  3. 然后浏览器访问: http://localhost:8000"
fi
echo ""
echo "查看日志:"
echo "  tail -f backend.log"
