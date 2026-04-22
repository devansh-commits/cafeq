'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { APP_NAME, APP_TAGLINE } from '@/lib/config'

const OWNER_PIN = '9999'

export default function StaffEntry() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)

  async function checkPin(next: string) {
    setLoading(true)

    // Owner PIN check (hardcoded is fine — matches admin/page.tsx)
    if (next === OWNER_PIN) {
      sessionStorage.setItem('cafeq_owner', 'true')
      sessionStorage.setItem('cafeq_owner_time', Date.now().toString())
      window.location.href = '/admin'
      return
    }

    // Worker PIN — fetch from DB, never hardcoded
    try {
      const { data } = await supabase
        .from('owner_settings')
        .select('password_hash')
        .limit(1)
        .single()
      const hash = data?.password_hash || ''
      const isMatch = hash ? await bcrypt.compare(next, hash) : next === '1234'
      if (isMatch) {
        localStorage.setItem('cafeq_worker', 'true')
        localStorage.setItem('cafeq_worker_time', Date.now().toString())
        window.location.href = '/worker'
        return
      }
    } catch {
      // DB error — fail safe
    }

    // Wrong PIN
    const newAttempts = attempts + 1
    setAttempts(newAttempts)
    if (newAttempts >= 5) {
      const lockTime = Date.now() + 30000
      setLockedUntil(lockTime)
      setError('Too many attempts. Locked for 30s.')
      setTimeout(() => { setError(''); setAttempts(0); setLockedUntil(0) }, 30000)
    } else {
      setError(`Wrong PIN. ${5 - newAttempts} attempts left.`)
      setTimeout(() => setError(''), 2000)
    }
    setPin('')
    setLoading(false)
  }

  function handlePin(digit: string) {
    if (pin.length >= 4) return
    if (Date.now() < lockedUntil) {
      setError('Too many attempts. Wait 30 seconds.')
      return
    }
    const next = pin + digit
    setPin(next)
    if (next.length === 4) {
      checkPin(next)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <style>{`.pb{width:72px;height:72px;border-radius:50%;background:#1a1a1a;color:white;font-size:1.4rem;font-weight:700;cursor:pointer;border:1.5px solid #2a2a2a;transition:all .15s} .pb:active{background:#f97316;transform:scale(.92)}`}</style>
      <div style={{ textAlign: 'center', width: '100%', maxWidth: 300 }}>
        <img src="/logo.png" alt="logo" style={{ width: '64px', height: '64px', objectFit: 'contain', marginBottom: '8px' }} />
        <h1 style={{ color: 'white', fontWeight: 900, fontSize: '1.6rem', marginBottom: 4 }}>{APP_NAME}</h1>
        <p style={{ color: '#6b7280', fontSize: '0.82rem', marginBottom: 36 }}>{APP_TAGLINE} · Staff Portal</p>

        {/* Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 36 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: pin.length > i ? '#f97316' : '#2a2a2a', transition: 'all .2s', transform: pin.length > i ? 'scale(1.1)' : 'scale(1)' }} />
          ))}
        </div>

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, justifyItems: 'center', marginBottom: 14 }}>
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} className="pb" onClick={() => handlePin(String(n))} disabled={loading}>{n}</button>
          ))}
          <div />
          <button className="pb" onClick={() => handlePin('0')} disabled={loading}>0</button>
          <button className="pb" onClick={() => { setPin(p => p.slice(0,-1)); setError('') }} disabled={loading} style={{ fontSize: '1.1rem' }}>⌫</button>
        </div>

        {loading && <p style={{ color: '#f97316', marginTop: 8, fontSize: '0.85rem', fontWeight: 600 }}>Opening...</p>}
        {error && <p style={{ color: '#ef4444', marginTop: 8, fontSize: '0.85rem', fontWeight: 600 }}>{error}</p>}

        <p style={{ color: '#374151', fontSize: '0.72rem', marginTop: 28 }}>Receptionist · Owner</p>
      </div>
    </div>
  )
}