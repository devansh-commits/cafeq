'use client'

export default function PrivacyPolicy() {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f7f4', padding: '24px 16px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', background: 'white', borderRadius: 20, padding: '32px 24px', border: '1px solid #f0ede8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <span style={{ fontSize: '1.8rem' }}>☕</span>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f97316' }}>SnappyOrder Privacy Policy</h1>
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.82rem', marginBottom: 24 }}>Last updated: April 2026</p>
  
          {[
            { title: '1. What We Collect', content: 'We collect your name, phone number, and email address when you register. We also collect your order history including items ordered, pickup times, and payment method chosen.' },
            { title: '2. How We Use It', content: 'Your information is used solely to process your café orders, send you OTP verification codes, and show your order history. We do not sell your data to any third party.' },
            { title: '3. Email OTP', content: 'We use Supabase Auth to send one-time passwords to your email for login verification. These OTPs expire within 10 minutes.' },
            { title: '4. Data Storage', content: 'Your data is stored securely on Supabase (PostgreSQL) servers located in Singapore (ap-southeast-1). All connections are encrypted via HTTPS.' },
            { title: '5. Data Retention', content: 'Order data is retained for up to 1 year for business records. You can request deletion of your account by contacting us.' },
            { title: '6. Cookies', content: 'We use browser localStorage to keep you logged in between sessions. No third-party tracking cookies are used.' },
            { title: '7. Contact', content: 'For any privacy concerns, contact us at the café counter or through the app.' },
          ].map(section => (
            <div key={section.title} style={{ marginBottom: 20 }}>
              <h2 style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '1rem', marginBottom: 6 }}>{section.title}</h2>
              <p style={{ color: '#6b7280', fontSize: '0.88rem', lineHeight: 1.6 }}>{section.content}</p>
            </div>
          ))}
  
          <button type="button" onClick={() => window.history.back()}
            style={{ background: '#f97316', color: 'white', fontWeight: 700, fontSize: '0.9rem', padding: '12px 24px', borderRadius: 14, border: 'none', cursor: 'pointer', marginTop: 8 }}>
            ← Go Back
          </button>
        </div>
      </div>
    )
  }