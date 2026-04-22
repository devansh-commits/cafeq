'use client'

export default function TermsOfService() {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f7f4', padding: '24px 16px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', background: 'white', borderRadius: 20, padding: '32px 24px', border: '1px solid #f0ede8' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <span style={{ fontSize: '1.8rem' }}>☕</span>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f97316' }}>SnappyOrder Terms of Service</h1>
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.82rem', marginBottom: 24 }}>Last updated: April 2026</p>
  
          {[
            { title: '1. Service', content: 'SnappyOrder is a pre-order platform for college cafés. It allows students to place food orders in advance and pick them up at a chosen time slot.' },
            { title: '2. Orders', content: 'Orders are confirmed once placed. A convenience fee of Rs.5–10 is charged per order. By placing an order, you agree to pay the full amount shown at checkout.' },
            { title: '3. Payment', content: 'Payments are made at the counter via UPI or cash when you collect your order. SnappyOrder does not process payments directly.' },
            { title: '4. Pickup', content: 'You must collect your order within 15 minutes of your chosen pickup slot. Uncollected orders may be cancelled without refund.' },
            { title: '5. Cancellations', content: 'Orders cannot be cancelled once placed. If the café is unable to fulfil your order, you will be notified and not charged the convenience fee.' },
            { title: '6. Convenience Fee', content: 'The convenience fee is non-refundable once an order is accepted by the café. It covers platform operating costs.' },
            { title: '7. Accuracy', content: 'Menu prices and availability are managed by the café. SnappyOrder is not responsible for price changes or items going out of stock after your order is placed.' },
            { title: '8. Account', content: 'You are responsible for keeping your account details accurate. Do not share your login OTP with anyone.' },
            { title: '9. Changes', content: 'We reserve the right to update these terms. Continued use of the app after changes constitutes acceptance.' },
          ].map(section => (
            <div key={section.title} style={{ marginBottom: 20 }}>
              <h2 style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '1rem', marginBottom: 6 }}>{section.title}</h2>
              <p style={{ color: '#6b7280', fontSize: '0.88rem', lineHeight: 1.6 }}>{section.content}</p>
            </div>
          ))}
  
          <button onClick={() => window.history.back()}
            style={{ background: '#f97316', color: 'white', fontWeight: 700, fontSize: '0.9rem', padding: '12px 24px', borderRadius: 14, border: 'none', cursor: 'pointer', marginTop: 8 }}>
            ← Go Back
          </button>
        </div>
      </div>
    )
  }