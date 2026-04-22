'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { APP_NAME, APP_TAGLINE } from '@/lib/config'

export default function LoginPage() {
  const [step, setStep] = useState<'details' | 'otp'>('details')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Check if already logged in via Supabase session
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        // Already have valid session — get user details from our users table
        const { data: userRecord } = await supabase
          .from('users')
          .select('name, phone, email')
          .eq('auth_id', session.user.id)
          .single()
        if (userRecord) {
          localStorage.setItem('cafeq_user', JSON.stringify({
            name: userRecord.name,
            phone: userRecord.phone,
            email: userRecord.email,
            id: session.user.id
          }))
          window.location.href = '/'
          return
        }
      }
      // Also check localStorage as fallback
      const saved = localStorage.getItem('cafeq_user')
      if (saved) {
        window.location.href = '/'
        return
      }
      setLoading(false)
    }
    checkSession()
  }, [])

  async function sendOTP() {
    if (!name.trim()) { setError('Please enter your name'); return }
    if (phone.length < 10) { setError('Please enter a valid 10-digit phone number'); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) { setError('Please enter a valid email address'); return }
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, data: { name, phone }, emailRedirectTo: undefined }
    })
    if (err) { setError(err.message); setLoading(false); return }
    setStep('otp')
    setLoading(false)
  }

  async function verifyOTP() {
    if (otp.length < 6) { setError('Please enter the OTP from your email'); return }
    setError('')
    setLoading(true)
    const { data, error: err } = await supabase.auth.verifyOtp({
      email, token: otp, type: 'email'
    })
    if (err) { setError('Invalid OTP. Please try again.'); setLoading(false); return }
    if (data.user) {
      // Save or update user in our users table
      const { data: existing } = await supabase.from('users').select('id').eq('email', email).single()
      if (!existing) {
        await supabase.from('users').insert({ name, phone, email, auth_id: data.user.id })
      } else {
        await supabase.from('users').update({ name, phone, auth_id: data.user.id }).eq('email', email)
      }
      localStorage.setItem('cafeq_user', JSON.stringify({ name, phone, email, id: data.user.id }))
    }
    window.location.href = '/'
  }

  // Show nothing while checking session
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f97316' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>☕</div>
        <p style={{ color: 'white', fontWeight: 800, fontSize: '1.5rem' }}>{APP_NAME}</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)', padding: '16px' }}>
      <style>{`
        .inp { width: 100%; padding: 13px 16px; border: 1.5px solid #e5e7eb; border-radius: 14px; font-size: 0.95rem; color: #1a1a1a; background: #fafafa; outline: none; box-sizing: border-box; }
        .inp:focus { border-color: #f97316; }
        .otp-inp { width: 100%; padding: 16px; border: 1.5px solid #e5e7eb; border-radius: 14px; font-size: 1.8rem; color: #1a1a1a; background: #fafafa; outline: none; text-align: center; letter-spacing: 0.5rem; box-sizing: border-box; }
        .otp-inp:focus { border-color: #f97316; }
      `}</style>

      <div style={{ background: 'white', borderRadius: '28px', padding: '36px 28px', width: '100%', maxWidth: '400px', boxShadow: '0 8px 40px rgba(249,115,22,0.12)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '8px' }}>☕</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#f97316', letterSpacing: '-0.03em', lineHeight: 1 }}>{APP_NAME}</h1>
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '6px' }}>{APP_TAGLINE}</p>
        </div>

        {step === 'details' ? (
          <>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px' }}>Welcome! 👋</h2>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '24px' }}>Enter your details to get started</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px', display: 'block' }}>Full Name</label>
                <input className="inp" placeholder="Your full name" value={name} onChange={e => setName(e.target.value.slice(0, 60))} maxLength={60} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px', display: 'block' }}>Phone Number</label>
                <input className="inp" placeholder="10-digit phone number" value={phone}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                    if (val.startsWith('0')) return
                    setPhone(val)
                  }} type="tel" />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px', display: 'block' }}>College Email</label>
                <input className="inp" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value.slice(0, 100))} type="email" maxLength={100} />
              </div>
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', marginTop: '12px', textAlign: 'center' }}>{error}</p>}
            <button onClick={sendOTP} disabled={loading}
              style={{ width: '100%', background: '#f97316', color: 'white', fontWeight: 700, fontSize: '1rem', padding: '14px', borderRadius: '16px', border: 'none', cursor: 'pointer', marginTop: '20px', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}>
              Send OTP →
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#9ca3af', marginTop: '16px' }}>
              A code will be sent to your email · Free · No spam
            </p>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📧</div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px' }}>Check your email!</h2>
              <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>We sent a code to</p>
              <p style={{ color: '#f97316', fontWeight: 700, fontSize: '0.9rem' }}>{email}</p>
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '6px', display: 'block', textAlign: 'center' }}>Enter OTP</label>
              <input className="otp-inp" placeholder="- - - - - -" value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))} type="tel" />
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', marginTop: '12px', textAlign: 'center' }}>{error}</p>}
            <button onClick={verifyOTP} disabled={loading}
              style={{ width: '100%', background: '#f97316', color: 'white', fontWeight: 700, fontSize: '1rem', padding: '14px', borderRadius: '16px', border: 'none', cursor: 'pointer', marginTop: '20px', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}>
              {loading ? 'Verifying...' : 'Verify & Login →'}
            </button>
            <button onClick={() => { setStep('details'); setOtp(''); setError('') }}
              style={{ width: '100%', background: 'transparent', color: '#6b7280', fontWeight: 600, fontSize: '0.9rem', padding: '12px', borderRadius: '16px', border: 'none', cursor: 'pointer', marginTop: '8px' }}>
              ← Change details
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#9ca3af', marginTop: '8px' }}>
              Didn't receive? Check spam or go back and retry
            </p>
          </>
        )}
      </div>
    </div>
  )
}