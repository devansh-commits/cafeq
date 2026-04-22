'use client'

export default function GlobalError({ error, reset, digest }: { error: Error; reset: () => void; digest?: string }) {
  return (
    <html lang="en">
      <head>
        <title>Error</title>
        {digest ? <meta name="error-digest" content={digest} /> : null}
      </head>
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f4', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>☕</div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: '#9ca3af', fontSize: '0.88rem', marginBottom: 24 }}>
              {error.message?.includes('fetch') || error.message?.includes('network')
                ? 'Connection problem. Please check your internet and try again.'
                : 'An unexpected error occurred. Please try again.'}
            </p>
            {digest && <p style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: 16 }}>Ref: {digest}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={reset}
                style={{ background: '#f97316', color: 'white', fontWeight: 700, fontSize: '0.9rem', padding: '12px 20px', borderRadius: 14, border: 'none', cursor: 'pointer' }}>
                Try Again
              </button>
              <button onClick={() => window.location.href = '/'}
                style={{ background: '#f3f4f6', color: '#374151', fontWeight: 600, fontSize: '0.9rem', padding: '12px 20px', borderRadius: 14, border: 'none', cursor: 'pointer' }}>
                Go Home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}