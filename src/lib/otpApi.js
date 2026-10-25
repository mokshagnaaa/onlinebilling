export const otpApi = {
  async sendOtp(email, purpose = 'registration') {
    let res
    try {
      res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      })
    } catch {
      // Direct fallback if proxy is bypassed
      res = await fetch('http://127.0.0.1:5000/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose }),
      })
    }

    const data = await res.json()
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Failed to send OTP email.')
    }
    return data
  },

  async verifyOtp(email, otp) {
    let res
    try {
      res = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
    } catch {
      // Direct fallback if proxy is bypassed
      res = await fetch('http://127.0.0.1:5000/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
    }

    const data = await res.json()
    if (!res.ok || !data.valid) {
      throw new Error(data.message || 'Invalid or expired OTP code.')
    }
    return data
  },
}
