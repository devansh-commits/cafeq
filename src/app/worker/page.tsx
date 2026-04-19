'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { LogOut, Printer, Bell, ChevronLeft, ChevronRight } from 'lucide-react'

const OWNER_PIN = '9999'

type OrderItem = { quantity: number; price_at_order: number; menu_items: { name: string } }
type Order = {
  id: string; order_number: string; status: string
  total_amount: number; convenience_fee: number; pickup_time: string
  payment_method: string; created_at: string
  users: { name: string; phone: string }
  order_items: OrderItem[]
}
type SlotInfo = { slot_time: string; max_orders: number; current_orders: number }
type Toast = { id: number; msg: string }

function slotTimeToMinutes(slotStr: string): number {
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

function matchToSlot(isoTime: string, slots: SlotInfo[]): string {
  const d = new Date(isoTime)
  const orderMins = d.getHours() * 60 + d.getMinutes()
  let best = slots[0]?.slot_time || ''
  let bestDiff = Infinity
  slots.forEach(s => {
    const diff = Math.abs(slotTimeToMinutes(s.slot_time) - orderMins)
    if (diff < bestDiff) { bestDiff = diff; best = s.slot_time }
  })
  return best
}

function playAlert() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const freqs = [880, 1100, 880]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq; osc.type = 'sine'
      gain.gain.setValueAtTime(0.5, ctx.currentTime + i * 0.2)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.18)
      osc.start(ctx.currentTime + i * 0.2)
      osc.stop(ctx.currentTime + i * 0.2 + 0.2)
    })
  } catch {}
}

function printSlip(order: Order, autoPrint = false) {
  const subtotal = order.total_amount - (order.convenience_fee || 0)
  const win = window.open('', '_blank', 'width=320,height=650')
  if (!win) return
  win.document.write(`<html><head>
  <style>
    @page{margin:0;size:80mm auto}
    body{font-family:'Courier New',monospace;font-size:13px;width:76mm;margin:0;padding:3mm;box-sizing:border-box}
    .c{text-align:center}.b{font-weight:bold}.big{font-size:24px;font-weight:900}
    .line{border-top:1px dashed #000;margin:5px 0}
    .row{display:flex;justify-content:space-between}
    .item{padding:3px 0;border-bottom:1px dotted #ccc}
  </style></head><body>
  <div class="c b" style="font-size:16px">☕ CaféQ</div>
  <div class="c" style="font-size:10px">Skip the queue · Order smart</div>
  <div class="line"></div>
  <div class="c big">#${order.order_number}</div>
  <div class="c b" style="font-size:14px">Pickup: ${order.pickup_time ? new Date(order.pickup_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
  <div class="line"></div>
  <div class="b">Customer: ${order.users?.name || ''}</div>
  <div>Phone: ${order.users?.phone || ''}</div>
  <div class="line"></div>
  <div class="b">ITEMS:</div>
  ${order.order_items.map(i => `
    <div class="item row">
      <span>${i.menu_items?.name} ×${i.quantity}</span>
      <span>Rs.${i.price_at_order * i.quantity}</span>
    </div>`).join('')}
  <div class="line"></div>
  <div class="row"><span>Subtotal</span><span>Rs.${subtotal}</span></div>
  <div class="row"><span>Convenience fee</span><span>Rs.${order.convenience_fee || 0}</span></div>
  <div class="line"></div>
  <div class="row b" style="font-size:15px"><span>TOTAL</span><span>Rs.${order.total_amount}</span></div>
  <div>Payment: ${order.payment_method === 'cash' ? 'Pay at counter' : 'UPI'}</div>
  <div class="line"></div>
  <div class="c" style="font-size:10px;margin-top:6px">Thank you! Come again 😊</div>
  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); if (autoPrint) win.close() }, 400)
}

export default function WorkerPage() {
  const [pin, setPin] = useState('')
  const [loggedIn, setLoggedIn] = useState(false)
  const [pinError, setPinError] = useState('')
  const [allSlots, setAllSlots] = useState<SlotInfo[]>([])
  const [ordersBySlot, setOrdersBySlot] = useState<Record<string, Order[]>>({})
  const [activeSlot, setActiveSlot] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'summary' | 'orders'>('orders')
  const [toasts, setToasts] = useState<Toast[]>([])
  const [showProfile, setShowProfile] = useState(false)
  const [newOrderDots, setNewOrderDots] = useState<Record<string, boolean>>({})
  const [blinkSlots, setBlinkSlots] = useState<Record<string, boolean>>({})
  const prevOrderIds = useRef<Set<string>>(new Set())
  const toastId = useRef(0)
  const slotBarRef = useRef<HTMLDivElement>(null)
  const initialLoad = useRef(true)
  const slotsRef = useRef<SlotInfo[]>([])

  useEffect(() => {
    if (sessionStorage.getItem('cafeq_worker') === 'true') setLoggedIn(true)
  }, [])

  const fetchAll = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]
    const { data: slotsData } = await supabase
      .from('time_slots').select('slot_time, max_orders, current_orders')
      .eq('date', today).order('slot_time')

    if (!slotsData || slotsData.length === 0) {
      await supabase.rpc('generate_daily_slots', { target_date: today })
      const { data: newSlots } = await supabase
        .from('time_slots').select('slot_time, max_orders, current_orders')
        .eq('date', today).order('slot_time')
      if (newSlots) { setAllSlots(newSlots); slotsRef.current = newSlots }
    } else {
      setAllSlots(slotsData); slotsRef.current = slotsData
    }

    const currentSlots = slotsRef.current
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const { data: ordersData } = await supabase
      .from('orders')
      .select(`id, order_number, status, total_amount, convenience_fee, pickup_time,
        payment_method, created_at, users(name, phone),
        order_items(quantity, price_at_order, menu_items(name))`)
      .gte('created_at', todayStart.toISOString())
      .in('status', ['pending', 'preparing', 'ready'])
      .order('pickup_time', { ascending: true })

    if (!ordersData) return

    const currentIds = new Set(ordersData.map((o: any) => o.id))
    const newOnes = ordersData.filter((o: any) => !prevOrderIds.current.has(o.id))

    if (!initialLoad.current && newOnes.length > 0) {
      playAlert()
      newOnes.forEach((o: any) => {
        const slotKey = matchToSlot(o.pickup_time, currentSlots)
        const msg = `🔔 New order #${o.order_number} → ${slotKey}`
        const id = ++toastId.current
        setToasts(prev => [...prev, { id, msg }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
        setNewOrderDots(prev => ({ ...prev, [slotKey]: true }))
        setBlinkSlots(prev => ({ ...prev, [slotKey]: true }))
        setTimeout(() => setBlinkSlots(prev => ({ ...prev, [slotKey]: false })), 4000)
        setTimeout(() => printSlip(o as Order, true), 800)
      })
    }

    prevOrderIds.current = currentIds
    initialLoad.current = false

    const grouped: Record<string, Order[]> = {}
    ordersData.forEach((o: any) => {
      const key = matchToSlot(o.pickup_time, currentSlots)
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(o)
    })
    setOrdersBySlot(grouped)

    if (!activeSlot) {
      const firstWithOrders = Object.keys(grouped)[0]
      if (firstWithOrders) setActiveSlot(firstWithOrders)
      else if (currentSlots.length > 0) setActiveSlot(currentSlots[0].slot_time)
    }
  }, [activeSlot])

  useEffect(() => {
    if (!loggedIn) return
    fetchAll()
    const interval = setInterval(fetchAll, 5000)
    return () => clearInterval(interval)
  }, [loggedIn, fetchAll])

  async function markReady(orderId: string) {
    await supabase.from('orders').update({ status: 'ready' }).eq('id', orderId)
    fetchAll()
  }

  async function markCollected(orderId: string) {
    const order = activeOrders.find(o => o.id === orderId)
    await supabase.from('orders').update({ status: 'completed' }).eq('id', orderId)
    if (order && activeSlot) {
      const slotInfo = allSlots.find(s => s.slot_time === activeSlot)
      if (slotInfo && slotInfo.current_orders > 0) {
        await supabase.from('time_slots')
          .update({ current_orders: slotInfo.current_orders - 1 })
          .eq('slot_time', activeSlot)
          .eq('date', new Date().toISOString().split('T')[0])
      }
    }
    fetchAll()
  }

  async function handleLogin() {
    if (pin === OWNER_PIN) { window.location.href = '/admin'; return }
    const { data } = await supabase.from('owner_settings').select('receptionist_pin').eq('id', 1).maybeSingle()
    const expected = data?.receptionist_pin || '1234'
    if (pin === expected) {
      sessionStorage.setItem('cafeq_worker', 'true')
      setLoggedIn(true); setPinError('')
    } else {
      setPinError('Wrong PIN. Try again.'); setPin('')
    }
  }

  function handleSlotClick(slot_time: string) {
    setActiveSlot(slot_time)
    setNewOrderDots(prev => ({ ...prev, [slot_time]: false }))
    setBlinkSlots(prev => ({ ...prev, [slot_time]: false }))
  }

  function scrollSlots(dir: 'left' | 'right') {
    slotBarRef.current?.scrollBy({ left: dir === 'right' ? 220 : -220, behavior: 'smooth' })
  }

  const activeOrders = activeSlot ? (ordersBySlot[activeSlot] || []) : []
  const aggregated: { name: string; qty: number; unit_price: number }[] = []
  activeOrders.forEach(order => {
    order.order_items.forEach(item => {
      const name = item.menu_items?.name || '?'
      const ex = aggregated.find(a => a.name === name)
      if (ex) ex.qty += item.quantity
      else aggregated.push({ name, qty: item.quantity, unit_price: item.price_at_order })
    })
  })

  // ── PIN SCREEN ──
  if (!loggedIn) return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <style>{`.pb{width:68px;height:68px;border-radius:50%;border:1.5px solid #2a2a2a;background:#1a1a1a;color:white;font-size:1.4rem;font-weight:700;cursor:pointer;transition:all .15s} .pb:active{background:#f97316;transform:scale(.92)}`}</style>
      <div style={{ textAlign: 'center', width: '100%', maxWidth: 300 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>☕</div>
        <h1 style={{ color: 'white', fontWeight: 900, fontSize: '1.6rem', marginBottom: 4 }}>CaféQ</h1>
        <p style={{ color: '#6b7280', fontSize: '0.82rem', marginBottom: 32 }}>Staff Portal · Enter PIN</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: pin.length > i ? '#f97316' : '#2a2a2a', transition: 'all .2s' }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, justifyItems: 'center', marginBottom: 14 }}>
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} className="pb" onClick={() => pin.length < 4 && setPin(p => p + n)}>{n}</button>
          ))}
          <div />
          <button className="pb" onClick={() => pin.length < 4 && setPin(p => p + '0')}>0</button>
          <button className="pb" onClick={() => setPin(p => p.slice(0,-1))} style={{ fontSize: '1rem' }}>⌫</button>
        </div>
        {pin.length === 4 && (
          <button onClick={handleLogin} style={{ width: '100%', background: '#f97316', color: 'white', fontWeight: 700, fontSize: '1rem', padding: '13px', borderRadius: 14, border: 'none', cursor: 'pointer' }}>
            Enter →
          </button>
        )}
        {pinError && <p style={{ color: '#ef4444', marginTop: 12, fontSize: '0.85rem' }}>{pinError}</p>}
      </div>
    </div>
  )

  // ── MAIN DASHBOARD ──
  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d', color: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100vh' }}>
      <style>{`
        @keyframes slideDown{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeOut{0%,70%{opacity:1}100%{opacity:0}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        .slot-btn{padding:8px 12px;border-radius:10px;border:1.5px solid #1e1e1e;background:#141414;color:#4b5563;font-weight:600;font-size:.74rem;cursor:pointer;white-space:nowrap;transition:all .2s;position:relative;flex-shrink:0;text-align:center;min-width:68px}
        .slot-btn.active{background:#f97316;border-color:#f97316;color:white}
        .slot-btn:hover:not(.active){background:#1e1e1e;color:#d1d5db}
        .slot-btn.has-orders:not(.active){border-color:#2a2a2a;color:#e5e7eb}
        .cb{width:24px;height:24px;border-radius:7px;border:2px solid #2a2a2a;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0}
        .cb.done{background:#22c55e;border-color:#22c55e}
        .print-btn{background:#1e293b;border:1px solid #1e293b;color:#64748b;border-radius:7px;padding:4px 9px;font-size:.72rem;cursor:pointer;display:flex;align-items:center;gap:3px;transition:all .15s;margin-top:5px}
        .print-btn:hover{background:#334155;color:white}
        .scroll-btn{background:#141414;border:1px solid #1e1e1e;color:#4b5563;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:all .15s}
        .scroll-btn:hover{background:#222;color:white}
        ::-webkit-scrollbar{height:3px;width:3px}
        ::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:4px}

        /* DESKTOP: side by side split */
        .split-screen { display: grid; grid-template-columns: 300px 1fr; flex: 1; overflow: hidden; }
        .mobile-tabs { display: none; }
        .panel-summary { display: flex !important; }
        .panel-orders { display: flex !important; }

        /* MOBILE: stacked with tabs */
        @media (max-width: 768px) {
          .split-screen { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
          .mobile-tabs { display: flex !important; }
          .panel-summary { display: none; flex-direction: column; overflow: hidden; flex: 1; }
          .panel-orders { display: none; flex-direction: column; overflow: hidden; flex: 1; }
          .panel-summary.tab-active { display: flex !important; }
          .panel-orders.tab-active { display: flex !important; }
        }
      `}</style>

      {/* TOASTS */}
      <div style={{ position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 999, display: 'flex', flexDirection: 'column', gap: 8, width: '90%', maxWidth: 480, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', color: 'white', padding: '10px 18px', borderRadius: 12, fontWeight: 700, fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: 8, animation: 'slideDown .25s ease, fadeOut 5s ease forwards', boxShadow: '0 6px 24px rgba(249,115,22,.45)' }}>
            <Bell size={14} /> {t.msg}
          </div>
        ))}
      </div>

      {/* TOP BAR */}
      <div style={{ background: '#111', borderBottom: '1px solid #1a1a1a', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <span style={{ fontSize: '1.2rem' }}>☕</span>
          <span style={{ fontWeight: 900, color: '#f97316', fontSize: '.95rem' }}>CaféQ</span>
        </div>
        <button className="scroll-btn" onClick={() => scrollSlots('left')}><ChevronLeft size={14} /></button>
        <div ref={slotBarRef} style={{ flex: 1, display: 'flex', gap: 5, overflowX: 'auto', scrollbarWidth: 'none', padding: '2px 0' }}>
          {allSlots.length === 0 ? (
            <span style={{ color: '#374151', fontSize: '.78rem', padding: '8px 0', whiteSpace: 'nowrap' }}>Loading slots...</span>
          ) : allSlots.map(slot => {
            const slotOrders = ordersBySlot[slot.slot_time] || []
            const hasOrders = slotOrders.length > 0
            const isActive = activeSlot === slot.slot_time
            const hasNew = newOrderDots[slot.slot_time]
            const isBlink = blinkSlots[slot.slot_time]
            const activeCount = slotOrders.length
            return (
              <button key={slot.slot_time}
                className={`slot-btn ${isActive ? 'active' : ''} ${hasOrders && !isActive ? 'has-orders' : ''}`}
                onClick={() => handleSlotClick(slot.slot_time)}>
                <div style={{ fontSize: '.74rem', fontWeight: 700 }}>{slot.slot_time}</div>
                <div style={{ marginTop: 3 }}>
                  {hasOrders ? (
                    <span style={{ background: isActive ? 'rgba(255,255,255,.3)' : '#f97316', color: 'white', borderRadius: 50, padding: '1px 7px', fontSize: '.67rem', fontWeight: 800, display: 'inline-block', animation: isBlink ? 'blink 0.5s ease-in-out 6' : 'none' }}>
                      {activeCount}/{slot.max_orders}
                    </span>
                  ) : (
                    <span style={{ color: isActive ? 'rgba(255,255,255,.4)' : '#1e1e1e', fontSize: '.65rem' }}>0/{slot.max_orders}</span>
                  )}
                </div>
                {hasNew && !isActive && (
                  <span style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, background: '#ef4444', borderRadius: '50%', border: '2px solid #0d0d0d', animation: 'pulse 1s infinite' }} />
                )}
              </button>
            )
          })}
        </div>
        <button className="scroll-btn" onClick={() => scrollSlots('right')}><ChevronRight size={14} /></button>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setShowProfile(!showProfile)}
            style={{ width: 36, height: 36, borderRadius: '50%', background: '#f97316', border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: '.9rem', color: 'white' }}>
            R
          </button>
          {showProfile && (
            <div style={{ position: 'absolute', top: 44, right: 0, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, minWidth: 140, zIndex: 100, animation: 'slideDown .2s ease' }}>
              <button onClick={() => { sessionStorage.removeItem('cafeq_worker'); setLoggedIn(false) }}
                style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', fontWeight: 600, fontSize: '.9rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                <LogOut size={14} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MOBILE TABS — only visible on phone */}
      <div className="mobile-tabs" style={{ background: '#111', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
        <button onClick={() => setActiveTab('summary')}
          style={{ flex: 1, padding: '10px', border: 'none', background: activeTab === 'summary' ? '#f97316' : 'transparent', color: activeTab === 'summary' ? 'white' : '#6b7280', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>
          📦 Summary
        </button>
        <button onClick={() => setActiveTab('orders')}
          style={{ flex: 1, padding: '10px', border: 'none', background: activeTab === 'orders' ? '#f97316' : 'transparent', color: activeTab === 'orders' ? 'white' : '#6b7280', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer' }}>
          🎫 Orders {activeOrders.length > 0 ? `(${activeOrders.length})` : ''}
        </button>
      </div>

      {/* EMPTY STATE */}
      {activeOrders.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
            <p style={{ color: '#374151', fontWeight: 600, fontSize: '.95rem' }}>No active orders in {activeSlot}</p>
            <p style={{ color: '#2a2a2a', fontSize: '.8rem', marginTop: 4 }}>All orders collected · Select another slot</p>
          </div>
        </div>
      ) : (
        <div className="split-screen">

          {/* LEFT — Slot Summary */}
          <div className={`panel-summary ${activeTab === 'summary' ? 'tab-active' : ''}`}
            style={{ borderRight: '1px solid #1a1a1a', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', borderBottom: '1px solid #1a1a1a', background: '#111', flexShrink: 0 }}>
              <p style={{ fontWeight: 700, color: 'white', fontSize: '.88rem' }}>📦 Slot Summary</p>
              <p style={{ color: '#4b5563', fontSize: '.7rem', marginTop: 2 }}>{activeSlot} · {activeOrders.length} active orders</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 54px 58px', padding: '6px 16px', background: '#0f0f0f', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
              {['Item', 'Qty', 'Price', 'Total'].map(h => (
                <span key={h} style={{ color: '#374151', fontSize: '.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</span>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {aggregated.map((item, i) => (
                <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 54px 58px', padding: '9px 16px', borderBottom: '1px solid #111', background: i % 2 === 0 ? '#0d0d0d' : '#0f0f0f' }}>
                  <span style={{ color: 'white', fontWeight: 600, fontSize: '.83rem' }}>{item.name}</span>
                  <span style={{ color: '#f97316', fontWeight: 900, fontSize: '.9rem' }}>{item.qty}</span>
                  <span style={{ color: '#4b5563', fontSize: '.78rem' }}>Rs.{item.unit_price}</span>
                  <span style={{ color: '#6b7280', fontSize: '.78rem' }}>Rs.{item.qty * item.unit_price}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '11px 16px', borderTop: '1px solid #1a1a1a', background: '#0f0f0f', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ color: '#4b5563', fontWeight: 600, fontSize: '.83rem' }}>Slot Revenue</span>
              <span style={{ color: '#f97316', fontWeight: 900, fontSize: '1.05rem' }}>Rs.{activeOrders.reduce((sum, o) => sum + o.total_amount, 0)}</span>
            </div>
          </div>

          {/* RIGHT — Per Order */}
          <div className={`panel-orders ${activeTab === 'orders' ? 'tab-active' : ''}`}
            style={{ flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '11px 16px', borderBottom: '1px solid #1a1a1a', background: '#111', flexShrink: 0 }}>
              <p style={{ fontWeight: 700, color: 'white', fontSize: '.88rem' }}>🎫 Individual Orders</p>
              <p style={{ color: '#4b5563', fontSize: '.7rem', marginTop: 2 }}>Tick ✓ = Ready · 2nd tick = Collected & Removed</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 90px 1fr 64px 34px', padding: '6px 16px', background: '#0f0f0f', borderBottom: '1px solid #1a1a1a', gap: 8, flexShrink: 0 }}>
              {['Token', 'Name', 'Items', 'Amt', '✓'].map(h => (
                <span key={h} style={{ color: '#374151', fontSize: '.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</span>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {activeOrders.map((order, i) => {
                const isReady = order.status === 'ready'
                return (
                  <div key={order.id}
                    style={{ display: 'grid', gridTemplateColumns: '90px 90px 1fr 64px 34px', padding: '11px 16px', borderBottom: '1px solid #111', gap: 8, background: isReady ? '#091209' : i % 2 === 0 ? '#0d0d0d' : '#0f0f0f', alignItems: 'start', transition: 'background .4s' }}>
                    <div>
                      <span style={{ fontWeight: 900, color: '#f97316', fontSize: '.9rem' }}>#{order.order_number}</span>
                      <button className="print-btn" onClick={() => printSlip(order)}>
                        <Printer size={9} /> Print
                      </button>
                    </div>
                    <div>
                      <p style={{ color: isReady ? '#4b5563' : 'white', fontWeight: 600, fontSize: '.8rem', lineHeight: 1.3 }}>{order.users?.name}</p>
                      <p style={{ color: '#2a2a2a', fontSize: '.68rem', marginTop: 2 }}>{order.payment_method === 'cash' ? '💵 Cash' : '📱 UPI'}</p>
                    </div>
                    <div>
                      {order.order_items.map((item, j) => (
                        <p key={j} style={{ color: isReady ? '#2a2a2a' : '#c4c4c4', fontSize: '.78rem', lineHeight: 1.6, textDecoration: isReady ? 'line-through' : 'none' }}>
                          {item.menu_items?.name} ×{item.quantity}
                        </p>
                      ))}
                    </div>
                    <span style={{ color: isReady ? '#2a2a2a' : '#6b7280', fontWeight: 700, fontSize: '.83rem' }}>Rs.{order.total_amount}</span>
                    <button className={`cb ${isReady ? 'done' : ''}`}
                      onClick={() => isReady ? markCollected(order.id) : markReady(order.id)}>
                      {isReady && <span style={{ color: 'white', fontWeight: 900, fontSize: '.85rem' }}>✓</span>}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}