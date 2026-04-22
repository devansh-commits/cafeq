'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Clock, User, Phone, CheckCircle } from 'lucide-react'

type TimeSlot = { id: string; slot_time: string; max_orders: number; current_orders: number }
type CartItem = { id: string; name: string; price: number; quantity: number; selectedCustomizations: Record<string, string> }

// Convert "01:15 PM" to minutes since midnight for comparison
function slotToMinutes(slotStr: string): number {
  const upper = slotStr.toUpperCase().trim()
  const isPM = upper.includes('PM')
  const isAM = upper.includes('AM')
  const clean = upper.replace('AM', '').replace('PM', '').trim()
  const parts = clean.split(':')
  let h = parseInt(parts[0])
  const m = parseInt(parts[1])
  if (isPM && h !== 12) h += 12
  if (isAM && h === 12) h = 0
  return h * 60 + m
}

function isPastSlot(slotStr: string): boolean {
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  return slotToMinutes(slotStr) <= nowMins
}

function isFullSlot(slot: TimeSlot): boolean {
  return slot.current_orders >= slot.max_orders
}

export default function CheckoutPage() {
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'cash'>('upi')
  const [loading, setLoading] = useState(false)
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [orderToken, setOrderToken] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cafeOpen, setCafeOpen] = useState(true)
  const orderInProgress = useRef(false)

  useEffect(() => {
    const user = localStorage.getItem('cafeq_user')
    if (!user) { window.location.href = '/login'; return }
    const u = JSON.parse(user)
    setName(u.name || '')
    setPhone(u.phone || '')
    fetchSlots()
    fetchCafeStatus()
    const saved = localStorage.getItem('cafeq_cart')
    if (saved) { try { setCart(JSON.parse(saved)) } catch { setCart([]) } }

    // Realtime slot updates
    const slotSub = supabase
      .channel('checkout-slots-realtime')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'time_slots' },
        (payload) => {
          setSlots(prev => prev.map(s =>
            s.id === payload.new.id ? { ...s, current_orders: payload.new.current_orders } : s
          ))
          setSelectedSlot(prev =>
            prev && prev.id === payload.new.id
              ? { ...prev, current_orders: payload.new.current_orders }
              : prev
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(slotSub) }
  }, [])

  async function fetchCafeStatus() {
    const { data } = await supabase.from('owner_settings').select('cafe_open').limit(1).single()
    if (data) setCafeOpen(data.cafe_open !== false)
  }

  async function fetchSlots() {
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await supabase.from('time_slots').select('id').eq('date', today).limit(1)
    if (!existing || existing.length === 0) {
      await supabase.rpc('generate_daily_slots', { target_date: today })
    }
    const { data } = await supabase.from('time_slots').select('*').eq('date', today).order('slot_time')
    if (data) setSlots(data)
  }

  function getSlotStatus(slot: TimeSlot) {
    if (isPastSlot(slot.slot_time)) return { label: '⏰ Passed', bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb' }
    if (isFullSlot(slot)) return { label: '🔴 Full', bg: '#fce4ec', text: '#c62828', border: '#ef9a9a' }
    const pct = slot.current_orders / slot.max_orders
    const isRush = slot.max_orders === 15
    const type = isRush ? '🔥 Rush' : '✅ Normal'
    if (pct < 0.6) return { label: type, bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' }
    if (pct < 0.9) return { label: '⚡ Filling', bg: '#fff8e1', text: '#f57f17', border: '#ffe082' }
    return { label: '🔴 Full', bg: '#fce4ec', text: '#c62828', border: '#ef9a9a' }
  }

  // Only show future, non-full slots as selectable
  const availableSlots = slots.filter(s => !isPastSlot(s.slot_time))

  const totalPrice = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const convenienceFee = totalPrice <= 100 ? 5 : totalPrice <= 150 ? 6 : totalPrice <= 200 ? 7 : 10
  const grandTotal = totalPrice + convenienceFee

  async function placeOrder() {
    // ── Café closed check ──
    if (!cafeOpen) {
      alert('The café is currently closed. Please try again later.')
      return
    }

    // ── Offline detection ──
    if (!navigator.onLine) {
      alert('You appear to be offline. Please check your connection and try again.')
      return
    }

    // ── Double tap / double submit prevention ──
    if (orderInProgress.current) return
    orderInProgress.current = true

    if (!name.trim()) { alert('Please enter your name'); orderInProgress.current = false; return }
    if (phone.length < 10) { alert('Please enter a valid 10-digit phone number'); orderInProgress.current = false; return }
    if (!selectedSlot) { alert('Please select a pickup slot'); orderInProgress.current = false; return }
    if (cart.length === 0) { alert('Your cart is empty!'); orderInProgress.current = false; return }

    // ── Block past slots ──
    if (isPastSlot(selectedSlot.slot_time)) {
      alert('This slot has already passed. Please select a future slot.')
      setSelectedSlot(null)
      orderInProgress.current = false
      return
    }

    setLoading(true)
    try {
      // ── Re-check slot availability server-side before placing order ──
      const { data: freshSlot } = await supabase
        .from('time_slots').select('current_orders, max_orders').eq('id', selectedSlot.id).single()

      if (!freshSlot) { alert('Slot not found. Please refresh.'); setLoading(false); orderInProgress.current = false; return }
      if (freshSlot.current_orders >= freshSlot.max_orders) {
        alert('This slot just filled up! Please select another slot.')
        setSelectedSlot(null)
        await fetchSlots()
        setLoading(false)
        orderInProgress.current = false
        return
      }

      let userId = ''
      // Upsert user by phone to prevent duplicates
      const { data: existingUser } = await supabase.from('users').select('id').eq('phone', phone).maybeSingle()
      if (existingUser) {
        userId = existingUser.id
        const { error: updateUserError } = await supabase.from('users').update({ name }).eq('id', existingUser.id)
        if (updateUserError) {
          console.error('Failed to update user name')
        }
      } else {
        const { data: newUser, error: userErr } = await supabase.from('users').insert({ name, phone }).select('id').single()
        if (userErr || !newUser?.id) throw new Error('Could not create user account. Please try again.')
        userId = newUser.id
      }
      if (!userId) throw new Error('Could not identify user. Please log out and log in again.')

      const { data: tokenData } = await supabase.rpc('get_next_token')
      const token = tokenData || 'AA001'

      const timeParts = selectedSlot.slot_time.replace(' AM', '').replace(' PM', '').split(':')
      let hours = parseInt(timeParts[0])
      const minutes = parseInt(timeParts[1])
      if (selectedSlot.slot_time.includes('PM') && hours !== 12) hours += 12
      if (selectedSlot.slot_time.includes('AM') && hours === 12) hours = 0
      const pickupTime = new Date()
      pickupTime.setHours(hours, minutes, 0, 0)

      // ── Server-side price verification ──
      // Fetch actual prices from DB to prevent cart manipulation
      const menuIds = cart.map(i => i.id)
      const { data: dbItems } = await supabase
        .from('menu_items')
        .select('id, price, is_available')
        .in('id', menuIds)

      if (!dbItems) throw new Error('Could not verify prices')

      // Check all items are still available and prices match
      for (const cartItem of cart) {
        const dbItem = dbItems.find(d => d.id === cartItem.id)
        if (!dbItem || !dbItem.is_available) throw new Error('One or more items in your cart are no longer available. Please go back and update your cart.')
        if (dbItem.price !== cartItem.price) throw new Error('Prices have been updated. Please go back to menu and add items again.')
      }

      // Recalculate total using DB prices (can't be manipulated)
      const verifiedTotal = dbItems.reduce((sum, dbItem) => {
        const cartItem = cart.find(c => c.id === dbItem.id)
        return sum + (dbItem.price * (cartItem?.quantity || 0))
      }, 0)
      const verifiedFee = verifiedTotal <= 100 ? 5 : verifiedTotal <= 150 ? 6 : verifiedTotal <= 200 ? 7 : 10
      const verifiedGrandTotal = verifiedTotal + verifiedFee

      const { data: order, error: orderErr } = await supabase.from('orders').insert({
        order_number: token, user_id: userId, status: 'pending',
        total_amount: verifiedGrandTotal, convenience_fee: verifiedFee,
        pickup_time: pickupTime.toISOString(), payment_method: paymentMethod, payment_status: 'pending'
      }).select('id').single()

      if (orderErr || !order) { throw new Error('Order creation failed') }

      const orderItemsPayload = cart.map((item) => ({
        order_id: order.id,
        menu_item_id: item.id,
        quantity: item.quantity,
        price_at_order: item.price
      }))
      const { error: itemsError } = await supabase.from('order_items').insert(orderItemsPayload)
      if (itemsError) {
        await supabase.from('orders').delete().eq('id', order.id)
        throw new Error('Order item creation failed. Please try again.')
      }

      const { error: slotUpdateError } = await supabase
        .rpc('increment_time_slot', { slot_id: selectedSlot.id })
      let slotIncremented = !slotUpdateError
      if (!slotIncremented && slotUpdateError?.message?.toLowerCase().includes('increment_time_slot')) {
        const { data: updatedSlotRows, error: fallbackSlotError } = await supabase
          .from('time_slots')
          .update({ current_orders: freshSlot.current_orders + 1 })
          .eq('id', selectedSlot.id)
          .lt('current_orders', freshSlot.max_orders)
          .eq('current_orders', freshSlot.current_orders)
          .select('id')
        slotIncremented = !fallbackSlotError && !!updatedSlotRows && updatedSlotRows.length > 0
      }
      if (!slotIncremented) {
        await supabase.from('order_items').delete().eq('order_id', order.id)
        await supabase.from('orders').delete().eq('id', order.id)
        throw new Error('This slot just filled up. Please select another slot.')
      }

      setOrderToken(token)
      setOrderPlaced(true)
      localStorage.removeItem('cafeq_cart')
    } catch (err: any) {
      const msg = err?.message || 'Something went wrong. Please try again.'
      alert(msg)
    } finally {
      setLoading(false)
      orderInProgress.current = false
    }
  }

  if (orderPlaced) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: '#f8f7f4' }}>
      <div style={{ background: 'white', borderRadius: '24px', padding: '32px', textAlign: 'center', maxWidth: '360px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🎉</div>
        <CheckCircle size={48} color="#22c55e" style={{ margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1a1a1a', marginBottom: '8px' }}>Order Placed!</h1>
        <p style={{ color: '#6b7280', marginBottom: '24px' }}>Your order is confirmed</p>
        <div style={{ background: '#fff7ed', border: '2px dashed #f97316', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '4px' }}>Your Order Token</p>
          <p style={{ fontSize: '3rem', fontWeight: 900, color: '#f97316', lineHeight: 1 }}>#{orderToken}</p>
          <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '8px' }}>Show this at the counter</p>
        </div>
        <div style={{ background: '#f8f7f4', borderRadius: '12px', padding: '16px', marginBottom: '24px', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Pickup slot</span>
            <span style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '0.9rem' }}>{selectedSlot?.slot_time}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Total</span>
            <span style={{ fontWeight: 700, color: '#f97316', fontSize: '0.9rem' }}>Rs.{grandTotal}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>Payment</span>
            <span style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '0.9rem' }}>{paymentMethod === 'cash' ? 'Pay at counter' : 'UPI'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => { window.location.href = '/orders' }}
            style={{ flex: 1, background: '#fff7ed', color: '#f97316', fontWeight: 700, fontSize: '0.9rem', padding: '14px', borderRadius: '16px', border: '1.5px solid #fed7aa', cursor: 'pointer' }}>
            Track Order
          </button>
          <button onClick={() => { window.location.href = '/' }}
            style={{ flex: 1, background: '#f97316', color: 'white', fontWeight: 700, fontSize: '0.9rem', padding: '14px', borderRadius: '16px', border: 'none', cursor: 'pointer' }}>
            Back to Menu
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '96px', background: '#f8f7f4' }}>
      <style>{`.inp{width:100%;padding:12px 16px;border:1.5px solid #e5e7eb;border-radius:14px;font-size:0.95rem;color:#1a1a1a;background:#fafafa;outline:none;box-sizing:border-box;} .inp:focus{border-color:#f97316;} .slotbtn{border:1.5px solid;border-radius:14px;padding:10px 12px;cursor:pointer;text-align:left;width:100%;background:white;transition:all 0.15s;} .slotbtn:disabled{cursor:not-allowed;opacity:0.5;}`}</style>
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: '#f97316', boxShadow: '0 2px 12px rgba(249,115,22,0.3)' }}>
        <div style={{ maxWidth: '672px', margin: '0 auto', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => { window.location.href = '/' }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={18} color="white" />
          </button>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>Checkout</h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem' }}>Almost there!</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '672px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Cafe Closed Banner */}
        {!cafeOpen && (
          <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.4rem' }}>🔴</span>
            <div>
              <p style={{ fontWeight: 800, color: '#dc2626', fontSize: '0.95rem' }}>Café is Closed</p>
              <p style={{ color: '#9ca3af', fontSize: '0.78rem', marginTop: 2 }}>Orders are not being accepted right now.</p>
            </div>
          </div>
        )}

        {/* Order Summary */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '16px', border: '1px solid #f0ede8' }}>
          <h2 style={{ fontWeight: 700, color: '#1a1a1a', marginBottom: '12px' }}>Order Summary</h2>
          {cart.length === 0 ? <p style={{ color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>Cart is empty — go back and add items!</p> : <>
            {cart.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div>
                  <p style={{ fontWeight: 500, color: '#1a1a1a' }}>{item.name} × {item.quantity}</p>
                  {item.selectedCustomizations && Object.values(item.selectedCustomizations).length > 0 && (
                    <p style={{ fontSize: '0.75rem', color: '#f97316' }}>{Object.values(item.selectedCustomizations).join(' · ')}</p>
                  )}
                </div>
                <p style={{ fontWeight: 600, color: '#374151' }}>Rs.{item.price * item.quantity}</p>
              </div>
            ))}
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', fontSize: '0.9rem', marginBottom: '4px' }}><span>Subtotal</span><span>Rs.{totalPrice}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '8px' }}><span>Convenience fee</span><span>Rs.{convenienceFee}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', borderTop: '1px dashed #e5e7eb', paddingTop: '8px', color: '#1a1a1a' }}><span>Total</span><span style={{ color: '#f97316' }}>Rs.{grandTotal}</span></div>
            </div>
          </>}
        </div>

        {/* Your Details */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '16px', border: '1px solid #f0ede8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontWeight: 700, color: '#1a1a1a' }}>Your Details</h2>
            <span style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: '0.72rem', padding: '3px 8px', borderRadius: '50px', fontWeight: 600 }}>✅ Auto-filled</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}><User size={13} /> Full Name</label>
              <input className="inp" placeholder="Enter your name" value={name} onChange={e => setName(e.target.value.slice(0, 60))} maxLength={60} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}><Phone size={13} /> Phone Number</label>
              <input className="inp" placeholder="10-digit phone number" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} type="tel" />
            </div>
          </div>
        </div>

        {/* Pickup Slot */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '16px', border: '1px solid #f0ede8' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={16} color="#f97316" />
              <h2 style={{ fontWeight: 700, color: '#1a1a1a' }}>Pick a Pickup Slot</h2>
            </div>
            <span style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: '0.68rem', padding: '2px 8px', borderRadius: '50px', fontWeight: 600 }}>🔴 Live</span>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '12px' }}>🔥 Rush = 15 min slots · ✅ Normal = 30 min slots · Grayed = passed or full</p>
          {availableSlots.length === 0 ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No available slots for today. Please try tomorrow!</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
              {availableSlots.map(slot => {
                const s = getSlotStatus(slot)
                const isSel = selectedSlot?.id === slot.id
                const disabled = isFullSlot(slot)
                return (
                  <button key={slot.id} className="slotbtn"
                    disabled={disabled}
                    onClick={() => !disabled && setSelectedSlot(slot)}
                    style={{
                      background: isSel ? '#fff7ed' : s.bg,
                      borderColor: isSel ? '#f97316' : s.border,
                      boxShadow: isSel ? '0 0 0 2px #f97316' : 'none',
                      opacity: disabled ? 0.5 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer'
                    }}>
                    <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1a1a1a', marginBottom: '2px' }}>{slot.slot_time}</p>
                    <p style={{ fontSize: '0.7rem', color: s.text, fontWeight: 600 }}>{slot.current_orders}/{slot.max_orders} · {s.label}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Payment Method */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '16px', border: '1px solid #f0ede8' }}>
          <h2 style={{ fontWeight: 700, color: '#1a1a1a', marginBottom: '12px' }}>Payment Method</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {(['upi', 'cash'] as const).map(method => (
              <button key={method} onClick={() => setPaymentMethod(method)}
                style={{ padding: '12px', borderRadius: '14px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', background: paymentMethod === method ? '#fff7ed' : '#f8f7f4', borderColor: paymentMethod === method ? '#f97316' : '#e5e7eb', borderWidth: paymentMethod === method ? '2px' : '1.5px', borderStyle: 'solid', color: paymentMethod === method ? '#f97316' : '#6b7280' }}>
                {method === 'upi' ? '📱 UPI / GPay' : '💵 Pay at Counter'}
              </button>
            ))}
          </div>
          {paymentMethod === 'upi' && <div style={{ marginTop: '10px', padding: '10px', borderRadius: '10px', background: '#fff7ed', color: '#9a3412', fontSize: '0.82rem', textAlign: 'center' }}>💡 Pay via UPI QR at counter when picking up</div>}
        </div>

        {/* Place Order */}
        <button onClick={placeOrder} disabled={loading || orderPlaced}
          style={{ width: '100%', background: loading ? '#fdba74' : '#f97316', color: 'white', fontWeight: 700, fontSize: '1.1rem', padding: '16px', borderRadius: '16px', border: 'none', cursor: loading ? 'wait' : 'pointer', boxShadow: '0 4px 14px rgba(249,115,22,0.35)', opacity: loading ? 0.8 : 1 }}>
          {loading ? '⏳ Placing Order...' : `Place Order · Rs.${grandTotal}`}
        </button>
      </div>
    </div>
  )
}