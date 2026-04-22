import Link from 'next/link'

export default function NotFound() {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f4', padding: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: 12 }}>☕</div>
          <h1 style={{ fontSize: '5rem', fontWeight: 900, color: '#f97316', lineHeight: 1, marginBottom: 8 }}>404</h1>
          <p style={{ fontWeight: 700, fontSize: '1.2rem', color: '#1a1a1a', marginBottom: 6 }}>Page not found</p>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: 28 }}>This page doesn't exist or was moved.</p>
          <Link href="/"
            style={{ background: '#f97316', color: 'white', fontWeight: 700, fontSize: '1rem', padding: '12px 28px', borderRadius: 16, border: 'none', cursor: 'pointer', display: 'inline-block', textDecoration: 'none' }}>
            Back to Menu →
          </Link>
        </div>
      </div>
    )
  }