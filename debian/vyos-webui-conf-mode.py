#!/usr/bin/env python3
"""
VyOS WebUI Configuration Mode Script
This script handles the integration with VyOS configuration system
"""

import os
import sys
import json
import subprocess
from pathlib import Path

CONFIG_DIR = Path("/config/vyos-webui")
CONFIG_FILE = CONFIG_DIR / "config.json"
SYSTEMD_SERVICE = "vyos-webui.service"
NGINX_SITE = "/etc/nginx/sites-enabled/vyos-webui"


def read_config():
    """Read configuration from VyOS using vyos-configd"""
    try:
        result = subprocess.run(
            ["python3", "-c", """
import vyos.configtree
import json
config = vyos.configtree.ConfigTree()
try:
    with open('/config/config.boot', 'r') as f:
        config.load_string(f.read())
    webui_config = {}
    # Extract webui service config
    if config.exists(['service', 'vyos-webui']):
        webui_config['enabled'] = config.return_value(['service', 'vyos-webui', 'enabled']) == 'true'
        if config.exists(['service', 'vyos-webui', 'port']):
            webui_config['port'] = int(config.return_value(['service', 'vyos-webui', 'port']))
        if config.exists(['service', 'vyos-webui', 'listen-address']):
            webui_config['listen_address'] = config.return_value(['service', 'vyos-webui', 'listen-address'])
        if config.exists(['service', 'vyos-webui', 'api-port']):
            webui_config['api_port'] = int(config.return_value(['service', 'vyos-webui', 'api-port']))
        # Session config
        if config.exists(['service', 'vyos-webui', 'session', 'timeout']):
            webui_config['session_timeout'] = int(config.return_value(['service', 'vyos-webui', 'session', 'timeout']))
        if config.exists(['service', 'vyos-webui', 'session', 'max-sessions']):
            webui_config['max_sessions'] = int(config.return_value(['service', 'vyos-webui', 'session', 'max-sessions']))
        # Security config
        if config.exists(['service', 'vyos-webui', 'security', 'cert-file']):
            webui_config['cert_file'] = config.return_value(['service', 'vyos-webui', 'security', 'cert-file'])
        if config.exists(['service', 'vyos-webui', 'security', 'key-file']):
            webui_config['key_file'] = config.return_value(['service', 'vyos-webui', 'security', 'key-file'])
        if config.exists(['service', 'vyos-webui', 'security', 'auto-cert']):
            webui_config['auto_cert'] = config.return_value(['service', 'vyos-webui', 'security', 'auto-cert']) == 'true'
        if config.exists(['service', 'vyos-webui', 'security', 'rate-limit']):
            webui_config['rate_limit'] = config.return_value(['service', 'vyos-webui', 'security', 'rate-limit']) == 'true'
        if config.exists(['service', 'vyos-webui', 'security', 'csrf-protection']):
            webui_config['csrf_protection'] = config.return_value(['service', 'vyos-webui', 'security', 'csrf-protection']) == 'true'
        # Logging config
        if config.exists(['service', 'vyos-webui', 'logging', 'level']):
            webui_config['log_level'] = config.return_value(['service', 'vyos-webui', 'logging', 'level'])
        if config.exists(['service', 'vyos-webui', 'logging', 'access-log']):
            webui_config['access_log'] = config.return_value(['service', 'vyos-webui', 'logging', 'access-log']) == 'true'
        # Auth config
        if config.exists(['service', 'vyos-webui', 'auth', 'mfa']):
            webui_config['mfa_enabled'] = config.return_value(['service', 'vyos-webui', 'auth', 'mfa']) == 'true'
        if config.exists(['service', 'vyos-webui', 'auth', 'local-users']):
            webui_config['local_users'] = config.return_value(['service', 'vyos-webui', 'auth', 'local-users']) == 'true'
        if config.exists(['service', 'vyos-webui', 'auth', 'radius-server']):
            webui_config['radius_server'] = config.return_value(['service', 'vyos-webui', 'auth', 'radius-server'])
    print(json.dumps(webui_config))
except Exception as e:
    print(json.dumps({'error': str(e)}))
"""],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0 and result.stdout:
            return json.loads(result.stdout)
    except Exception:
        pass
    return {}


def apply_config(config):
    """Apply the configuration"""
    # Create config directory
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    # Save config to file
    default_config = {
        "enabled": True,
        "port": 443,
        "listen_address": "0.0.0.0",
        "api_port": 8000,
        "session_timeout": 30,
        "max_sessions": 10,
        "auto_cert": True,
        "rate_limit": True,
        "csrf_protection": True,
        "log_level": "info",
        "access_log": True,
        "mfa_enabled": False,
        "local_users": True,
    }
    merged_config = {**default_config, **config}

    with open(CONFIG_FILE, "w") as f:
        json.dump(merged_config, f, indent=2)

    # Update environment file
    env_content = f"""# VyOS WebUI Configuration (auto-generated)
API_HOST=127.0.0.1
API_PORT={merged_config['api_port']}
API_WORKERS=4
VYOS_HOST=127.0.0.1
VYOS_CONFIG_DIR=/config
SECRET_KEY={os.urandom(32).hex()}
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24
SESSION_TIMEOUT_MINUTES={merged_config['session_timeout']}
RATE_LIMIT_ENABLED={str(merged_config['rate_limit']).lower()}
LOG_LEVEL={merged_config['log_level'].upper()}
LOG_DIR=/var/log/vyos-webui
ENABLE_MFA={str(merged_config['mfa_enabled']).lower()}
ENABLE_CONFIG_BACKUP=true
ENABLE_REALTIME_LOGS=true
"""
    with open("/etc/vyos-webui/config.env", "w") as f:
        f.write(env_content)

    # Update nginx config
    update_nginx_config(merged_config)

    # Generate certificates if needed
    if merged_config.get("auto_cert", True):
        generate_self_signed_cert()

    # Manage service
    if merged_config.get("enabled", True):
        enable_service()
        restart_service()
    else:
        disable_service()


def update_nginx_config(config):
    """Update nginx configuration"""
    port = config.get("port", 443)
    listen_addr = config.get("listen_address", "0.0.0.0")

    nginx_conf = f"""server {{
    listen {listen_addr}:{port} ssl http2;
    listen [::]:{port} ssl http2;

    server_name _;

    ssl_certificate /etc/vyos-webui/ssl/cert.pem;
    ssl_certificate_key /etc/vyos-webui/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    access_log /var/log/nginx/vyos-webui-access.log;
    error_log /var/log/nginx/vyos-webui-error.log;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {{
        root /opt/vyos-webui/static;
        try_files $uri $uri/ /index.html;
    }}

    location /api/ {{
        proxy_pass http://127.0.0.1:{config.get('api_port', 8000)};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
}}
"""
    nginx_dir = Path("/etc/nginx/sites-available")
    nginx_dir.mkdir(parents=True, exist_ok=True)

    with open("/etc/nginx/sites-available/vyos-webui", "w") as f:
        f.write(nginx_conf)

    # Enable the site
    nginx_enabled = Path("/etc/nginx/sites-enabled")
    nginx_enabled.mkdir(parents=True, exist_ok=True)

    nginx_link = nginx_enabled / "vyos-webui"
    if not nginx_link.exists():
        try:
            nginx_link.symlink_to("/etc/nginx/sites-available/vyos-webui")
        except FileExistsError:
            pass

    # Reload nginx
    try:
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
    except Exception:
        pass


def generate_self_signed_cert():
    """Generate self-signed SSL certificate"""
    ssl_dir = Path("/etc/vyos-webui/ssl")
    ssl_dir.mkdir(parents=True, exist_ok=True)

    cert_path = ssl_dir / "cert.pem"
    key_path = ssl_dir / "key.pem"

    if cert_path.exists() and key_path.exists():
        return

    try:
        subprocess.run([
            "openssl", "req", "-x509", "-nodes", "-days", "3650",
            "-newkey", "rsa:2048",
            "-keyout", str(key_path),
            "-out", str(cert_path),
            "-subj", "/C=US/ST=Local/L=Local/O=VyOS/OU=WebUI/CN=vyos-webui"
        ], check=True, capture_output=True)

        os.chmod(key_path, 0o600)
        os.chmod(cert_path, 0o644)
    except Exception as e:
        print(f"Warning: Could not generate certificate: {e}", file=sys.stderr)


def enable_service():
    """Enable and start the service"""
    try:
        subprocess.run(["systemctl", "enable", SYSTEMD_SERVICE], check=True, capture_output=True)
        subprocess.run(["systemctl", "start", SYSTEMD_SERVICE], check=True, capture_output=True)
    except Exception as e:
        print(f"Warning: Could not enable service: {e}", file=sys.stderr)


def disable_service():
    """Disable and stop the service"""
    try:
        subprocess.run(["systemctl", "stop", SYSTEMD_SERVICE], check=True, capture_output=True)
        subprocess.run(["systemctl", "disable", SYSTEMD_SERVICE], check=True, capture_output=True)
    except Exception as e:
        print(f"Warning: Could not disable service: {e}", file=sys.stderr)


def restart_service():
    """Restart the service"""
    try:
        subprocess.run(["systemctl", "restart", SYSTEMD_SERVICE], check=True, capture_output=True)
    except Exception as e:
        print(f"Warning: Could not restart service: {e}", file=sys.stderr)


def verify_config(config):
    """Verify the configuration is valid"""
    # Check port ranges
    port = config.get("port", 443)
    if not (1 <= port <= 65535):
        return False, "Invalid port number"

    api_port = config.get("api_port", 8000)
    if not (1 <= api_port <= 65535):
        return False, "Invalid API port number"

    return True, ""


def main():
    """Main function"""
    if len(sys.argv) < 2:
        print("Usage: vyos-webui-conf-mode.py [command]")
        sys.exit(1)

    command = sys.argv[1]

    if command == "update":
        config = read_config()
        valid, msg = verify_config(config)
        if not valid:
            print(f"Config verification failed: {msg}", file=sys.stderr)
            sys.exit(1)
        apply_config(config)
    elif command == "verify":
        config = read_config()
        valid, msg = verify_config(config)
        if not valid:
            print(msg, file=sys.stderr)
            sys.exit(1)
    elif command == "reset":
        if CONFIG_FILE.exists():
            CONFIG_FILE.unlink()
        disable_service()
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
