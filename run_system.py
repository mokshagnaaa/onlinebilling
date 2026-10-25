import subprocess
import sys
import time
import os

def main():
    print("=" * 60)
    print("  ✦ GLAMOUR TOUCH BEAUTY PARLOUR BILLING SYSTEM ✦  ")
    print("=" * 60)
    print("[1/2] Starting Python OTP Server (Port 5000)...")
    otp_proc = subprocess.Popen([sys.executable, "otp_server.py"])
    time.sleep(1.5)

    print("[2/2] Starting Vite Frontend Server (Port 5173)...")
    vite_cmd = "npm.cmd" if os.name == "nt" else "npm"
    vite_proc = subprocess.Popen([vite_cmd, "run", "dev"])

    try:
        print("\nAll servers active:")
        print("  • Python OTP Server: http://127.0.0.1:5000")
        print("  • Web Billing Application: http://localhost:5173\n")
        vite_proc.wait()
        otp_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down servers...")
        vite_proc.terminate()
        otp_proc.terminate()

if __name__ == "__main__":
    main()
