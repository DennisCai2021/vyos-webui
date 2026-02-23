# VyOS Web UI DEB 包构建说明

## 构建前准备

需要在构建机器上安装：
- Python 3.11
- python3.11-venv
- python3-pip
- fakeroot
- dpkg-dev

```bash
sudo apt install python3.11 python3.11-venv python3-pip fakeroot dpkg-dev
```

## 完整构建步骤

### 1. 下载 Python 依赖并创建 venv

```bash
cd /home/ubuntu/Codes/vyos-webui/backend

# 清理旧文件
rm -rf venv vendor

# 下载 Python 3.11 兼容的依赖包
python3.11 -m pip download -d vendor -r requirements.txt

# 创建并激活 venv
python3.11 -m venv venv
source venv/bin/activate

# 从本地 vendor 目录安装依赖
pip install --no-index --find-links=vendor -r requirements.txt

# 退出 venv
deactivate
```

### 2. 创建构建目录结构

```bash
rm -rf /tmp/vyos-webui-build
mkdir -p /tmp/vyos-webui-build/DEBIAN
mkdir -p /tmp/vyos-webui-build/opt/vyos-webui
mkdir -p /tmp/vyos-webui-build/etc/vyos-webui
mkdir -p /tmp/vyos-webui-build/lib/systemd/system
```

### 3. 复制文件到构建目录

```bash
cd /home/ubuntu/Codes/vyos-webui

# 后端（包含 venv 和 vendor）
cp -r backend /tmp/vyos-webui-build/opt/vyos-webui/

# 前端
mkdir -p /tmp/vyos-webui-build/opt/vyos-webui/frontend
cp -r frontend/dist /tmp/vyos-webui-build/opt/vyos-webui/frontend/

# 辅助脚本
cp debian/vyos-webui-wrapper /tmp/vyos-webui-build/opt/vyos-webui/
cp debian/start.sh /tmp/vyos-webui-build/opt/vyos-webui/
cp debian/stop.sh /tmp/vyos-webui-build/opt/vyos-webui/
cp debian/status.sh /tmp/vyos-webui-build/opt/vyos-webui/

# Systemd 服务
cp debian/vyos-webui.service /tmp/vyos-webui-build/lib/systemd/system/

# 配置文件
cp debian/vyos-webui.conf /tmp/vyos-webui-build/etc/vyos-webui/config.env

# DEBIAN 控制文件
cp debian/control /tmp/vyos-webui-build/DEBIAN/
cp debian/preinst /tmp/vyos-webui-build/DEBIAN/
cp debian/postinst /tmp/vyos-webui-build/DEBIAN/
cp debian/prerm /tmp/vyos-webui-build/DEBIAN/
cp debian/postrm /tmp/vyos-webui-build/DEBIAN/
```

### 4. 设置文件权限

```bash
# DEBIAN 脚本
chmod 755 /tmp/vyos-webui-build/DEBIAN/preinst
chmod 755 /tmp/vyos-webui-build/DEBIAN/postinst
chmod 755 /tmp/vyos-webui-build/DEBIAN/prerm
chmod 755 /tmp/vyos-webui-build/DEBIAN/postrm

# 应用脚本
chmod 755 /tmp/vyos-webui-build/opt/vyos-webui/vyos-webui-wrapper
chmod 755 /tmp/vyos-webui-build/opt/vyos-webui/start.sh
chmod 755 /tmp/vyos-webui-build/opt/vyos-webui/stop.sh
chmod 755 /tmp/vyos-webui-build/opt/vyos-webui/status.sh

# Systemd 服务
chmod 644 /tmp/vyos-webui-build/lib/systemd/system/vyos-webui.service

# 配置文件
chmod 600 /tmp/vyos-webui-build/etc/vyos-webui/config.env
```

### 5. 构建 DEB 包

```bash
cd /tmp
fakeroot dpkg-deb --build vyos-webui-build vyos-webui_0.0.1-1_all.deb
```

### 6. 复制到项目目录

```bash
cp /tmp/vyos-webui_0.0.1-1_all.deb /home/ubuntu/Codes/vyos-webui/
```

## DEB 包安装使用

### 在 VyOS 1.4 上安装

```bash
# 1. 复制 DEB 包到 VyOS
scp vyos-webui_0.0.1-1_all.deb vyos@<vyos-ip>:/tmp/

# 2. 安装
ssh vyos@<vyos-ip>
sudo dpkg -i /tmp/vyos-webui_0.0.1-1_all.deb

# 3. 启动服务
# 方式一: systemd
sudo systemctl start vyos-webui
sudo systemctl enable vyos-webui  # 开机自启

# 方式二: 脚本（与 deploy.sh 一致）
cd /opt/vyos-webui
./start.sh
```

### 修改 VyOS SSH 连接配置

```bash
sudo vi /opt/vyos-webui/backend/.env

# 修改后重启服务
cd /opt/vyos-webui && ./stop.sh && ./start.sh
# 或
sudo systemctl restart vyos-webui
```

## 文件结构

DEB 包包含的内容：

```
/opt/vyos-webui/
├── backend/              # 后端代码
│   ├── venv/            # Python 3.11 venv（已预装所有依赖）
│   ├── vendor/          # 离线依赖包
│   ├── app/
│   ├── main.py
│   ├── requirements.txt
│   └── .env             # VyOS SSH 连接配置
├── frontend/
│   └── dist/            # 构建好的前端
├── start.sh             # 启动脚本
├── stop.sh              # 停止脚本
├── status.sh            # 状态查看脚本
└── vyos-webui-wrapper   # systemd 包装脚本

/etc/vyos-webui/
└── config.env           # 环境变量配置

/lib/systemd/system/
└── vyos-webui.service   # systemd 服务文件
```
