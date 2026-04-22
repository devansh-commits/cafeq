'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, RefreshCw, Clock } from 'lucide-react'

type Order = {
  id: string
  order_number: string
  status: string
  total_amount: number
  convenience_fee: number
  pickup_time: string
  payment_method: string
  created_at: string
  order_items: { quantity: number; price_at_order: number; menu_items: { name: string } }[]
}

const STEPS = [
  { key: 'pending', label: 'Received', emoji: '📋' },
  { key: 'preparing', label: 'Preparing', emoji: '👨‍🍳' },
  { key: 'ready', label: 'Ready!', emoji: '✅' },
]

function getStep(status: string) {
  if (status === 'pending') return 0
  if (status === 'preparing') return 1
  if (status === 'ready' || status === 'completed') return 2
  return 0
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending': return { label: '📋 Order Received', bg: '#f3f4f6', color: '#374151' }
    case 'preparing': return { label: '👨‍🍳 Being Prepared', bg: '#fff8e1', color: '#f57f17' }
    case 'ready': return { label: '✅ Ready for Pickup!', bg: '#e8f5e9', color: '#2e7d32' }
    case 'completed': return { label: '🎉 Completed', bg: '#e3f2fd', color: '#1565c0' }
    default: return { label: status, bg: '#f3f4f6', color: '#374151' }
  }
}

function toUTC(iso: string) { return iso.includes('Z') || iso.includes('+') ? iso : iso.replace(' ', 'T') + 'Z' }

function formatTime(iso: string) {
  return new Date(toUTC(iso)).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

function formatPickup(iso: string) {
  return new Date(toUTC(iso)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

function istDate() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const user = localStorage.getItem('cafeq_user')
    if (!user) { window.location.href = '/login'; return }
    fetchOrders()
    const interval = setInterval(fetchOrders, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchOrders() {
    const userStr = localStorage.getItem('cafeq_user')
    if (!userStr) return
    const user = JSON.parse(userStr)
    const lookupKey = user.phone || user.email
    const lookupField = user.phone ? 'phone' : 'email'
    const { data: userRecord } = await supabase.from('users').select('id').eq(lookupField, lookupKey).maybeSingle()
    if (!userRecord) { setLoading(false); return }
    const { data } = await supabase
      .from('orders')
      .select(`id, order_number, status, total_amount, convenience_fee, pickup_time, payment_method, created_at, order_items(quantity, price_at_order, menu_items(name))`)
      .eq('user_id', userRecord.id)
      .order('created_at', { ascending: false })
    if (data) setOrders(data as any)
    setLoading(false)
    setRefreshing(false)
  }

  async function cancelOrder(orderId: string) {
    if (!confirm('Cancel this order? This cannot be undone.')) return
    const order = orders.find(o => o.id === orderId)
    if (!order || order.status !== 'pending') {
      alert('This order cannot be cancelled anymore.')
      return
    }
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId)
      .eq('status', 'pending')
      .select('id')
    if (error) {
      alert('Could not cancel order right now. Please try again.')
      return
    }
    if (!data || data.length === 0) {
      alert('This order can no longer be cancelled.')
      return
    }
    // Decrement slot count so the slot opens up for other students
    try {
      const today = istDate()
      const pickupDate = new Date(new Date(order.pickup_time).getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0]
      if (pickupDate === today) {
        const slotTime = new Date(order.pickup_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase()
        const { data: slotRow } = await supabase
          .from('time_slots')
          .select('id, current_orders')
          .eq('date', today)
          .eq('slot_time', slotTime)
          .maybeSingle()
        if (slotRow && slotRow.current_orders > 0) {
          await supabase.from('time_slots')
            .update({ current_orders: slotRow.current_orders - 1 })
            .eq('id', slotRow.id)
        }
      }
    } catch { /* slot decrement is best-effort */ }
    fetchOrders()
  }

  const activeOrders = orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled')
  const pastOrders = orders.filter(o => o.status === 'completed' || o.status === 'cancelled')

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f4' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>☕</div>
        <p style={{ color: '#f97316', fontWeight: 700 }}>Loading orders...</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', paddingBottom: '40px' }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: '#f97316', boxShadow: '0 2px 12px rgba(249,115,22,0.3)' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => window.location.href = '/'}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>My Orders</h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.72rem', marginTop: '2px' }}>Track your orders live · auto-refreshes every 30s</p>
          </div>
          <button onClick={() => { setRefreshing(true); fetchOrders() }}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <RefreshCw size={16} color="white" style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>

        {orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', animation: 'fadeUp 0.3s ease forwards' }}>
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🍽️</div>
            <h2 style={{ fontWeight: 700, color: '#1a1a1a', marginBottom: '8px' }}>No orders yet!</h2>
            <p style={{ color: '#9ca3af', marginBottom: '24px' }}>Place your first order from the menu</p>
            <button onClick={() => window.location.href = '/'}
              style={{ background: '#f97316', color: 'white', fontWeight: 700, padding: '12px 28px', borderRadius: '16px', border: 'none', cursor: 'pointer', fontSize: '0.95rem' }}>
              Browse Menu →
            </button>
          </div>
        ) : (
          <>
            {/* Active Orders */}
            {activeOrders.length > 0 && (
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <h2 style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '1rem' }}>Active Orders</h2>
                </div>

                {activeOrders.map(order => {
                  const badge = getStatusBadge(order.status)
                  const step = getStep(order.status)
                  const isExp = expanded === order.id
                  return (
                    <div key={order.id} style={{ background: 'white', borderRadius: '20px', marginBottom: '14px', border: '1px solid #f0ede8', overflow: 'hidden', animation: 'fadeUp 0.3s ease forwards' }}>

                      {/* Top badge */}
                      <div style={{ background: badge.bg, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: badge.color, fontSize: '0.95rem' }}>{badge.label}</span>
                        <span style={{ fontWeight: 900, color: '#f97316', fontSize: '1rem' }}>#{order.order_number}</span>
                      </div>

                      {/* Progress Steps */}
                      <div style={{ padding: '20px 24px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {STEPS.map((s, i) => (
                            <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                <div style={{
                                  width: '40px', height: '40px', borderRadius: '50%',
                                  background: step >= i ? '#f97316' : '#f3f4f6',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '1.1rem', flexShrink: 0,
                                  boxShadow: step >= i ? '0 2px 8px rgba(249,115,22,0.35)' : 'none',
                                  transition: 'all 0.4s ease'
                                }}>
                                  {s.emoji}
                                </div>
                                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: step >= i ? '#f97316' : '#9ca3af', whiteSpace: 'nowrap' }}>
                                  {s.label}
                                </span>
                              </div>
                              {i < STEPS.length - 1 && (
                                <div style={{ flex: 1, height: '3px', margin: '0 6px', marginBottom: '18px', borderRadius: '4px', background: step > i ? '#f97316' : '#f3f4f6', transition: 'background 0.4s ease' }} />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Info row */}
                      <div style={{ padding: '0 16px 14px', borderTop: '1px solid #f5f5f5' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontSize: '0.83rem' }}>
                            <Clock size={13} />
                            Pickup: <strong style={{ color: '#1a1a1a' }}>{formatPickup(order.pickup_time)}</strong>
                          </div>
                          <span style={{ fontWeight: 800, color: '#f97316', fontSize: '1rem' }}>Rs.{order.total_amount}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                          <button onClick={() => setExpanded(isExp ? null : order.id)}
                            style={{ color: '#f97316', fontWeight: 600, fontSize: '0.82rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {isExp ? '▲ Hide items' : '▼ View items'}
                          </button>
                          {order.status === 'pending' && (
                            <button onClick={() => cancelOrder(order.id)}
                              style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.78rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '3px 10px', cursor: 'pointer' }}>
                              ✕ Cancel
                            </button>
                          )}
                        </div>
                        {isExp && (
                          <div style={{ marginTop: '10px', background: '#f8f7f4', borderRadius: '12px', padding: '10px 12px' }}>
                            {order.order_items.map((item, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.85rem', color: '#374151' }}>
                                <span>{item.menu_items?.name} × {item.quantity}</span>
                                <span>Rs.{item.price_at_order * item.quantity}</span>
                              </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', fontSize: '0.78rem', color: '#9ca3af', borderTop: '1px dashed #e5e7eb', marginTop: '4px' }}>
                              <span>Convenience fee</span><span>Rs.{order.convenience_fee}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Past Orders */}
            {pastOrders.length > 0 && (
              <div>
                <h2 style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '1rem', marginBottom: '12px' }}>Past Orders</h2>
                {pastOrders.map(order => {
                  const isExp = expanded === order.id
                  return (
                    <div key={order.id} style={{ background: 'white', borderRadius: '16px', marginBottom: '10px', border: '1px solid #f0ede8', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 800, color: '#f97316', fontSize: '0.95rem' }}>#{order.order_number}</span>
                        <span style={{ fontWeight: 700, color: '#1a1a1a' }}>Rs.{order.total_amount}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>{formatTime(order.created_at)}</span>
                        <button onClick={() => setExpanded(isExp ? null : order.id)}
                          style={{ color: '#f97316', fontWeight: 600, fontSize: '0.78rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          {isExp ? '▲ Hide' : '▼ Details'}
                        </button>
                      </div>
                      {isExp && (
                        <div style={{ marginTop: '10px', background: '#f8f7f4', borderRadius: '12px', padding: '10px 12px' }}>
                          {order.order_items.map((item, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '0.83rem', color: '#374151' }}>
                              <span>{item.menu_items?.name} × {item.quantity}</span>
                              <span>Rs.{item.price_at_order * item.quantity}</span>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #e5e7eb', fontSize: '0.78rem', color: '#9ca3af' }}>
                            <span>Payment</span>
                            <span style={{ textTransform: 'capitalize' }}>{order.payment_method === 'cash' ? 'Pay at counter' : 'UPI'}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}