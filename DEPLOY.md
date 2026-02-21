# VyOS Web UI 部署文档

本文档介绍如何在 VyOS 路由器上部署 VyOS Web UI。

## 前置要求

- VyOS 1.4+ 版本
- Python 3.12+
- Node.js 18+
- 至少 512MB 可用内存
- 至少 1GB 可用磁盘空间

## 部署步骤

### 1. 安装依赖

在 VyOS 上执行以下命令安装必要的软件包：

```bash
# 进入系统 shell
sudo su

# 安装 Python 和 Node.js (如果 VyOS 版本较新可能已包含)
apt update
apt install -y python3-pip python3-venv nodejs npm git

# 检查版本
python3 --version
node --version
npm --version
```

### 2. 上传项目文件

将项目文件上传到 VyOS 的 `/opt/vyos-webui` 目录：

```bash
mkdir -p /opt/vyos-webui
cd /opt/vyos-webui

# 如果使用 git 克隆
# git clone <repository-url> .

# 或者手动上传文件到该目录
```

### 3. 配置后端

```bash
cd /opt/vyos-webui/backend

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装 Python 依赖
pip install -r requirements.txt

# 创建环境配置文件
cat > .env << 'EOF'
VYOS_HOST=127.0.0.1
VYOS_PORT=22
VYOS_USERNAME=vyos
VYOS_PASSWORD=vyos
VYOS_TIMEOUT=30
EOF
```

### 4. 配置前端

```bash
cd /opt/vyos-webui/frontend

# 安装 Node.js 依赖
npm install

# 构建生产版本
npm run build
```

### 5. 配置系统服务

创建后端服务文件 `/etc/systemd/system/vyos-webui-backend.service`：

```ini
[Unit]
Description=VyOS Web UI Backend
After=network.target

[Service]
Type=simple
User=vyos
WorkingDirectory=/opt/vyos-webui/backend
Environment="PATH=/opt/vyos-webui/backend/venv/bin"
ExecStart=/opt/vyos-webui/backend/venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

创建前端服务文件 `/etc/systemd/system/vyos-webui-frontend.service`：

```ini
[Unit]
Description=VyOS Web UI Frontend
After=network.target

[Service]
Type=simple
User=vyos
WorkingDirectory=/opt/vyos-webui/frontend
Environment="PATH=/usr/bin"
ExecStart=/usr/bin/npx serve -s dist -l 5173 -L
Restart=always

[Install]
WantedBy=multi-user.target
```

### 6. 启动服务

```bash
# 重载 systemd 配置
systemctl daemon-reload

# 启用并启动服务
systemctl enable vyos-webui-backend
systemctl enable vyos-webui-frontend
systemctl start vyos-webui-backend
systemctl start vyos-webui-frontend

# 查看服务状态
systemctl status vyos-webui-backend
systemctl status vyos-webui-frontend
```

### 7. 配置防火墙（如果需要）

```bash
configure
set firewall name local-default rule 100 action accept
set firewall name local-default rule 100 destination port 5173
set firewall name local-default rule 100 protocol tcp
set firewall name local-default rule 101 action accept
set firewall name local-default rule 101 destination port 8000
set firewall name local-default rule 101 protocol tcp
commit
save
```

## 访问 Web UI

部署完成后，通过浏览器访问：

- **前端界面**: `http://<vyos-ip>:5173`
- **后端 API**: `http://<vyos-ip>:8000/docs`

默认登录账号：
- 用户名: `vyos`
- 密码: `vyos`

## 故障排查

### 查看服务日志

```bash
# 后端日志
journalctl -u vyos-webui-backend -f

# 前端日志
journalctl -u vyos-webui-frontend -f
```

### 检查端口是否监听

```bash
ss -tlnp | grep -E ':(5173|8000)'
```

### 手动测试后端

```bash
cd /opt/vyos-webui/backend
source venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 手动测试前端

```bash
cd /opt/vyos-webui/frontend
npm run dev -- --host 0.0.0.0
```
