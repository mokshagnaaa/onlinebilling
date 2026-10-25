import os
import random
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# SMTP credentials are supplied by the local environment, never committed here.
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SENDER_EMAIL = os.getenv("SMTP_SENDER_EMAIL", "")
SENDER_PASSWORD = os.getenv("SMTP_SENDER_PASSWORD", "")

# In-memory storage for OTPs - NO DATABASE as strictly required
# Format: [{"email": str, "otp": str, "purpose": str, "expires_at": float, "created_at": float}]
otp_records = []

# Registered users in-memory store fallback
registered_users = []

def save_otp_in_memory(email: str, otp: str, purpose: str):
    """Store generated OTP in an in-memory list (no database)."""
    global otp_records
    email_clean = email.lower().strip()
    # Remove any existing active OTP for this email
    otp_records = [item for item in otp_records if item["email"] != email_clean]
    record = {
        "email": email_clean,
        "otp": str(otp).strip(),
        "purpose": purpose,
        "created_at": time.time(),
        "expires_at": time.time() + 600,  # 10 minutes expiry
    }
    otp_records.append(record)
    print("[OTP SERVER] Stored OTP.")

def verify_otp_in_memory(email: str, otp: str):
    """Check whether generated OTP is correct and not expired."""
    global otp_records
    email_clean = email.lower().strip()
    otp_clean = str(otp).strip()
    now = time.time()

    for item in otp_records:
        if item["email"] == email_clean:
            if now > item["expires_at"]:
                return False, "OTP has expired. Please request a new one."
            if item["otp"] == otp_clean:
                # Remove OTP once verified successfully
                otp_records = [r for r in otp_records if r != item]
                print(f"[OTP SERVER] Successfully verified OTP for {email_clean}")
                return True, "OTP verified successfully."
            else:
                return False, "Incorrect OTP. Please check the code sent to your email."

    return False, "No OTP found for this email or it has expired. Please request a new one."

def send_smtp_email(to_email: str, otp: str, purpose: str):
    """Send OTP via Gmail SMTP using Python smtplib."""
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        raise RuntimeError("SMTP_SENDER_EMAIL and SMTP_SENDER_PASSWORD must be configured.")

    purpose_label = "Registration" if purpose == "registration" else "Password Reset"
    subject = f"✦ Glamour Touch - Your {purpose_label} OTP is {otp}"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Glamour Touch OTP</title>
      <style>
        body {{
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          background-color: #fdf2f8;
          margin: 0;
          padding: 24px;
          color: #2e1065;
        }}
        .email-container {{
          max-width: 480px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 12px 30px rgba(236, 72, 153, 0.15);
          border: 1px solid #fbcfe8;
        }}
        .header {{
          background: linear-gradient(135deg, #e92367, #8b5cf6);
          padding: 32px 24px;
          text-align: center;
          color: white;
        }}
        .header h1 {{
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }}
        .header p {{
          margin: 6px 0 0;
          font-size: 13px;
          opacity: 0.9;
        }}
        .body-content {{
          padding: 32px 24px;
          text-align: center;
        }}
        .subtext {{
          font-size: 15px;
          color: #64748b;
          margin-bottom: 22px;
        }}
        .otp-code {{
          display: inline-block;
          font-size: 38px;
          font-weight: 800;
          letter-spacing: 8px;
          color: #e92367;
          background: #fff0f5;
          padding: 16px 32px;
          border-radius: 12px;
          border: 2px dashed #f62d73;
          margin: 10px 0 24px;
        }}
        .footer-note {{
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.5;
        }}
        .footer {{
          background: #fdf4f8;
          padding: 16px;
          text-align: center;
          font-size: 12px;
          color: #a1a1aa;
          border-top: 1px solid #fae8f0;
        }}
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <h1>✦ Glamour Touch</h1>
          <p>Beauty Parlour Billing System</p>
        </div>
        <div class="body-content">
          <p class="subtext">Your one-time verification code for <strong>{purpose_label}</strong> is:</p>
          <div class="otp-code">{otp}</div>
          <p class="footer-note">This code will expire in <strong>10 minutes</strong>.<br>If you did not request this OTP, please disregard this email.</p>
        </div>
        <div class="footer">
          © Glamour Touch Beauty Parlour • Secure Authentication
        </div>
      </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Glamour Touch <{SENDER_EMAIL}>"
    msg["To"] = to_email

    text_part = MIMEText(f"Your Glamour Touch verification code for {purpose_label} is: {otp}. Valid for 10 minutes.", "plain")
    html_part = MIMEText(html_body, "html")

    msg.attach(text_part)
    msg.attach(html_part)

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=20) as server:
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.sendmail(SENDER_EMAIL, [to_email], msg.as_string())
    print("[OTP SERVER] OTP email sent.")

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "message": "Glamour Touch Python OTP Server is active",
        "active_otps_count": len(otp_records)
    })

@app.route("/api/otp/send", methods=["POST"])
def send_otp():
    data = request.get_json(force=True, silent=True) or {}
    email = data.get("email", "").strip()
    purpose = data.get("purpose", "registration").strip()

    if not email or "@" not in email:
        return jsonify({"success": False, "message": "A valid email address is required"}), 400

    # Generate 6-digit OTP
    otp = f"{random.randint(100000, 999999)}"

    # Send email
    try:
        send_smtp_email(email, otp, purpose)
        save_otp_in_memory(email, otp, purpose)
        return jsonify({
            "success": True,
            "message": f"Verification OTP has been sent to {email}"
        })
    except Exception as e:
        print(f"[OTP SERVER ERROR] Failed to send email: {e}")
        return jsonify({
            "success": False,
            "message": f"Failed to send email: {str(e)}"
        }), 500

@app.route("/api/otp/verify", methods=["POST"])
def verify_otp():
    data = request.get_json(force=True, silent=True) or {}
    email = data.get("email", "").strip()
    otp = data.get("otp", "").strip()

    if not email or not otp:
        return jsonify({"success": False, "message": "Email and OTP are both required"}), 400

    valid, message = verify_otp_in_memory(email, otp)
    if valid:
        return jsonify({"success": True, "valid": True, "message": message})
    else:
        return jsonify({"success": False, "valid": False, "message": message}), 400

if __name__ == "__main__":
    print("[OTP SERVER] Starting Glamour Touch Python OTP Server on port 5000...")
    app.run(host="0.0.0.0", port=5000, debug=False)
