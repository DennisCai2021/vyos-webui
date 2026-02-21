#!/usr/bin/env python3
"""Quick start script for backend server"""

import sys
import os
import time
import subprocess
import threading
import requests

def read_backend_output(proc):
    """Read and print backend output"""
    for line in proc.stdout:
        print(f"[BACKEND] {line}", end="")

def test_api_endpoints():
    """Test API endpoints"""
    base_url = "http://127.0.0.1:8000"

    print("\n" + "=" * 70)
    print("Testing API Endpoints")
    print("=" * 70)

    # Root
    try:
        r = requests.get(f"{base_url}/", timeout=5)
        print(f"\nGET / - {r.status_code}")
        print(f"  Response: {r.json()}")
    except Exception as e:
        print(f"\nGET / - Error: {e}")

    # Health
    try:
        r = requests.get(f"{base_url}/health", timeout=5)
        print(f"\nGET /health - {r.status_code}")
        print(f"  Response: {r.json()}")
    except Exception as e:
        print(f"\nGET /health - Error: {e}")

    # System Info
    try:
        r = requests.get(f"{base_url}/api/v1/system/info", timeout=15)
        print(f"\nGET /api/v1/system/info - {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"  Version: {data.get('version', {}).get('version')}")
            print(f"  Uptime: {data.get('uptime', {}).get('uptime_string')}")
            print(f"  CPU: {data.get('hardware', {}).get('cpu_model')}")
        else:
            print(f"  Response: {r.text[:200]}")
    except Exception as e:
        print(f"\nGET /api/v1/system/info - Error: {e}")

    # Network Interfaces
    try:
        r = requests.get(f"{base_url}/api/v1/network/interfaces", timeout=15)
        print(f"\nGET /api/v1/network/interfaces - {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"  Found {len(data)} interfaces:")
            for iface in data:
                print(f"    - {iface.get('name')} ({iface.get('status')})")
        else:
            print(f"  Response: {r.text[:200]}")
    except Exception as e:
        print(f"\nGET /api/v1/network/interfaces - Error: {e}")

    # Routes
    try:
        r = requests.get(f"{base_url}/api/v1/network/routes", timeout=15)
        print(f"\nGET /api/v1/network/routes - {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"  Found {len(data)} routes")
        else:
            print(f"  Response: {r.text[:200]}")
    except Exception as e:
        print(f"\nGET /api/v1/network/routes - Error: {e}")

    # ARP Table
    try:
        r = requests.get(f"{base_url}/api/v1/network/arp-table", timeout=15)
        print(f"\nGET /api/v1/network/arp-table - {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            print(f"  Found {len(data)} ARP entries")
        else:
            print(f"  Response: {r.text[:200]}")
    except Exception as e:
        print(f"\nGET /api/v1/network/arp-table - Error: {e}")

    print("\n" + "=" * 70)
    print("API Docs: http://127.0.0.1:8000/docs")
    print("=" * 70)


def main():
    """Main function"""
    print("=" * 70)
    print("VyOS Web UI - Backend Server")
    print("=" * 70)

    proc = None
    try:
        print("\nStarting backend server...")
        cmd = [
            sys.executable, "-m", "uvicorn",
            "main:app",
            "--host", "0.0.0.0",
            "--port", "8000",
        ]

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
        )

        output_thread = threading.Thread(
            target=read_backend_output,
            args=(proc,),
            daemon=True,
        )
        output_thread.start()

        print("Waiting for server to start (5 seconds)...")
        time.sleep(5)

        if proc.poll() is not None:
            print(f"Backend exited with code: {proc.returncode}")
            return 1

        # Test endpoints
        test_api_endpoints()

        print("\nServer is running. Press Ctrl+C to stop.")
        print("API Docs: http://127.0.0.1:8000/docs")
        print("\nNext step: Start frontend in another terminal:")
        print("  cd ../frontend && npm run dev")

        while True:
            time.sleep(1)
            if proc.poll() is not None:
                print(f"\nBackend exited with code: {proc.returncode}")
                break

    except KeyboardInterrupt:
        print("\n\nStopping...")
    finally:
        if proc:
            print("Terminating backend...")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            print("Done.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
