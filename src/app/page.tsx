'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ShoppingCart, Clock, Zap, X, Send, ChevronDown, ChevronUp, Plus, Minus, Sparkles, LogOut, ClipboardList, ChevronRight, ChevronLeft } from 'lucide-react'

type CustomizationOption = { name: string; choices: string[] }
type MenuItem = {
  id: string; name: string; description: string; price: number
  category: string; prep_time_minutes: number; is_available: boolean
  customizations?: { options: CustomizationOption[] }
}
type CartItem = MenuItem & { quantity: number; selectedCustomizations: Record<string, string> }
type TimeSlot = { id: string; slot_time: string; max_orders: number; current_orders: number }
type AIItem = { name: string; price: number }
type ChatMessage = { role: 'user' | 'assistant'; content: string; items?: AIItem[] }
type ActiveOrder = { id: string; order_number: string; status: string; pickup_time: string; updated_at: string }

function getOrderStatusInfo(status: string) {
  switch (status) {
    case 'pending': return { label: 'Order Received', dot: '#f97316', bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' }
    case 'preparing': return { label: 'Being Prepared 👨‍🍳', dot: '#eab308', bg: '#fefce8', border: '#fde68a', text: '#854d0e' }
    case 'ready': return { label: 'Ready for Pickup! 🎉', dot: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' }
    default: return { label: status, dot: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280' }
  }
}

export default function Home() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [activeCategory, setActiveCategory] = useState('All')
  const [loading, setLoading] = useState(true)
  const [showCart, setShowCart] = useState(false)
  const [showAI, setShowAI] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null)
  const [selectedCustomizations, setSelectedCustomizations] = useState<Record<string, string>>({})
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [showSlots, setShowSlots] = useState(false)
  const [userName, setUserName] = useState('')
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([])
  const [currentOrderIdx, setCurrentOrderIdx] = useState(0)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hi! I'm your CafeQ assistant! Ask me anything like 'What's under Rs.80?' or 'Which slots are free?' or 'What's quick to make?'" }
  ])
  const [chatInput, setChatInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<any>(null)
  const touchStartX = useRef<number>(0)

  useEffect(() => {
    let interval: any = null
    let orderSub: any = null
    let slotSub: any = null

    async function init() {
      const saved = localStorage.getItem('cafeq_user')
      if (saved) {
        const u = JSON.parse(saved)
        userRef.current = u
        setUserName(u.name || 'Student')
        setLoading(false)
        fetchMenu()
        fetchSlots()
        fetchActiveOrders(u)
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: userRecord } = await supabase
            .from('users').select('name, phone, email').eq('auth_id', session.user.id).single()
          if (userRecord) {
            const u = { name: userRecord.name, phone: userRecord.phone, email: userRecord.email, id: session.user.id }
            localStorage.setItem('cafeq_user', JSON.stringify(u))
            userRef.current = u
            setUserName(u.name || 'Student')
            setLoading(false)
            fetchMenu()
            fetchSlots()
            fetchActiveOrders(u)
          } else { window.location.href = '/login'; return }
        } else { window.location.href = '/login'; return }
      }

      orderSub = supabase
        .channel('orders-changes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' },
          () => { if (userRef.current) fetchActiveOrders(userRef.current) })
        .subscribe()

      slotSub = supabase
        .channel('slots-changes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'time_slots' },
          () => { fetchSlots() })
        .subscribe()

      interval = setInterval(() => {
        if (userRef.current) fetchActiveOrders(userRef.current)
        fetchSlots()
      }, 5000)
    }

    init()
    return () => {
      if (interval) clearInterval(interval)
      if (orderSub) supabase.removeChannel(orderSub)
      if (slotSub) supabase.removeChannel(slotSub)
    }
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  async function fetchMenu() {
    const { data } = await supabase.from('menu_items').select('*').eq('is_available', true)
    if (data) setMenuItems(data)
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

  async function fetchActiveOrders(user: any) {
    try {
      const { data: userRecord } = await supabase.from('users').select('id').eq('email', user.email).single()
      if (!userRecord) { setActiveOrders([]); return }
      const { data } = await supabase
        .from('orders').select('id, order_number, status, pickup_time, updated_at')
        .eq('user_id', userRecord.id)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: false })

      // ── Auto-clear ready orders after 5 minutes
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000)
      const filtered = (data || []).filter((o: any) => {
        if (o.status === 'ready') {
          return o.updated_at ? new Date(o.updated_at) > fiveMinsAgo : true
        }
        return true
      })
      setActiveOrders(filtered)
      setCurrentOrderIdx(prev => Math.min(prev, Math.max(0, filtered.length - 1)))
    } catch { setActiveOrders([]) }
  }

  function getSlotStatus(slot: TimeSlot) {
    const pct = slot.current_orders / slot.max_orders
    const isRush = slot.max_orders === 15
    const typeLabel = isRush ? '🔥 Rush' : '✅ Normal'
    if (pct < 0.6) return { label: typeLabel, color: 'bg-green-100 text-green-700 border-green-200' }
    if (pct < 0.9) return { label: '⚡ Filling up', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
    return { label: '🔴 Full*', color: 'bg-red-100 text-red-700 border-red-200' }
  }

  function openCustomization(item: MenuItem) {
    if (item.customizations?.options?.length) {
      const defaults: Record<string, string> = {}
      item.customizations.options.forEach(opt => { defaults[opt.name] = opt.choices[1] || opt.choices[0] })
      setSelectedCustomizations(defaults)
      setCustomizingItem(item)
    } else { addToCart(item, {}) }
  }

  function addToCart(item: MenuItem, customizations: Record<string, string>) {
    const key = item.id + JSON.stringify(customizations)
    setCart(prev => {
      const exists = prev.find(i => i.id + JSON.stringify(i.selectedCustomizations) === key)
      if (exists) return prev.map(i => i.id + JSON.stringify(i.selectedCustomizations) === key ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { ...item, quantity: 1, selectedCustomizations: customizations }]
    })
    setCustomizingItem(null)
  }

  function removeFromCartSimple(itemId: string) {
    setCart(prev => {
      const exists = prev.find(i => i.id === itemId)
      if (!exists) return prev
      if (exists.quantity > 1) return prev.map(i => i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i)
      return prev.filter(i => i.id !== itemId)
    })
  }

  function addToCartByName(aiItem: AIItem) {
    const found = menuItems.find(m => m.name.toLowerCase() === aiItem.name.toLowerCase())
    if (found) addToCart(found, {})
  }

  function removeFromCartByName(name: string) {
    const found = menuItems.find(m => m.name.toLowerCase() === name.toLowerCase())
    if (!found) return
    removeFromCartSimple(found.id)
  }

  function getCartQtyByName(name: string) {
    const found = menuItems.find(m => m.name.toLowerCase() === name.toLowerCase())
    if (!found) return 0
    return cart.filter(i => i.id === found.id).reduce((sum, i) => sum + i.quantity, 0)
  }

  function removeFromCart(key: string) {
    setCart(prev => {
      const exists = prev.find(i => i.id + JSON.stringify(i.selectedCustomizations) === key)
      if (exists && exists.quantity > 1) return prev.map(i => i.id + JSON.stringify(i.selectedCustomizations) === key ? { ...i, quantity: i.quantity - 1 } : i)
      return prev.filter(i => i.id + JSON.stringify(i.selectedCustomizations) !== key)
    })
  }

  function goToCheckout() {
    localStorage.setItem('cafeq_cart', JSON.stringify(cart))
    window.location.href = '/checkout'
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    localStorage.removeItem('cafeq_user')
    localStorage.removeItem('cafeq_cart')
    window.location.href = '/login'
  }

  function formatPickup(iso: string) {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }

  function handleTouchStart(e: React.TouchEvent) { touchStartX.current = e.touches[0].clientX }
  function handleTouchEnd(e: React.TouchEvent) {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 40) {
      if (diff > 0 && currentOrderIdx < activeOrders.length - 1) setCurrentOrderIdx(i => i + 1)
      if (diff < 0 && currentOrderIdx > 0) setCurrentOrderIdx(i => i - 1)
    }
  }

  async function sendToAI() {
    if (!chatInput.trim()) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setAiLoading(true)
    const menuContext = menuItems.map(i => `${i.name} - Rs.${i.price} - ${i.prep_time_minutes} min - ${i.category}`).join('\n')
    const slotContext = slots.map(s => `${s.slot_time}: ${s.current_orders}/${s.max_orders} orders (${s.max_orders === 15 ? 'Rush' : 'Normal'})`).join('\n')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMessages.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userMsg }],
          menuContext, slotContext
        })
      })
      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content || 'Sorry, try again!'
      const items = data.items || []
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply, items }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, try again!' }])
    }
    setAiLoading(false)
  }

  const categories = ['All', ...Array.from(new Set(menuItems.map(i => i.category)))]
  const filtered = activeCategory === 'All' ? menuItems : menuItems.filter(i => i.category === activeCategory)
  const totalItems = cart.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const convenienceFee = totalPrice <= 100 ? 5 : totalPrice <= 150 ? 6 : totalPrice <= 200 ? 7 : 10
  const grandTotal = totalPrice + convenienceFee

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f97316' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>☕</div>
        <p style={{ color: 'white', fontWeight: 800, fontSize: '1.5rem' }}>CaféQ</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen pb-24" style={{ background: '#f8f7f4' }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes popIn{0%{transform:scale(0.85);opacity:0}70%{transform:scale(1.03)}100%{transform:scale(1);opacity:1}}
        @keyframes breathe{0%,100%{box-shadow:0 0 0 0 rgba(249,115,22,0.4)}50%{box-shadow:0 0 0 10px rgba(249,115,22,0)}}
        @keyframes dot{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes slideLeft{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        @keyframes cartSlide{from{opacity:0;transform:translateY(-12px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        .btn-scale{transition:transform 0.15s ease;} .btn-scale:active{transform:scale(0.92);}
        .menu-card{transition:box-shadow 0.2s ease,transform 0.2s ease;}
        .menu-card:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,0,0,0.07);}
        .chat-input{color:#1a1a1a !important;} .chat-input::placeholder{color:#aaa !important;}
        .order-bar{transition:all 0.2s ease;} .order-bar:active{transform:scale(0.98);}
        .order-slide{animation:slideLeft 0.2s ease forwards;}
      `}</style>

      {/* HEADER */}
      <div className="sticky top-0 z-40" style={{ background: '#f97316', boxShadow: '0 2px 12px rgba(249,115,22,0.3)' }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span style={{ fontSize: '1.8rem' }}>☕</span>
            <div>
              <h1 style={{ fontSize: '1.9rem', fontWeight: 800, color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }}>CaféQ</h1>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.7rem', fontWeight: 500 }}>Hey {userName.split(' ')[0]}! 👋</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowCart(!showCart)}
              className="relative flex items-center gap-2 btn-scale"
              style={{ background: 'white', color: '#f97316', borderRadius: '50px', padding: '8px 16px', fontWeight: 700, fontSize: '0.9rem' }}>
              <ShoppingCart size={17} />
              Cart
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {totalItems}
                </span>
              )}
            </button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setShowUserMenu(!showUserMenu)}
                className="btn-scale w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
                style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1.5px solid rgba(255,255,255,0.4)' }}>
                {userName.charAt(0).toUpperCase()}
              </button>
              {showUserMenu && (
                <div style={{ position: 'absolute', top: '44px', right: 0, background: 'white', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid #f0ede8', minWidth: '160px', zIndex: 100, animation: 'fadeUp 0.2s ease forwards' }}>
                  <button onClick={() => { window.location.href = '/orders'; setShowUserMenu(false) }}
                    style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#374151', fontWeight: 600, fontSize: '0.9rem', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #f0ede8' }}>
                    <ClipboardList size={16} color="#f97316" /> My Orders
                  </button>
                  <button onClick={handleLogout}
                    style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#ef4444', fontWeight: 600, fontSize: '0.9rem', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <LogOut size={16} color="#ef4444" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── FLOATING CART OVERLAY — hovers over everything, dismissable ── */}
      {showCart && (
        <>
          {/* Backdrop */}
          <div onClick={() => setShowCart(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 50, backdropFilter: 'blur(2px)' }} />
          {/* Cart panel — fixed below header */}
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51, padding: '0', animation: 'cartSlide 0.2s ease forwards' }}>
            <div style={{ background: 'white', borderRadius: '20px', boxShadow: '0 12px 40px rgba(0,0,0,0.18)', border: '1px solid #fed7aa', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              <div style={{ padding: '16px 16px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h2 style={{ fontWeight: 700, fontSize: '1.1rem', color: '#1a1a1a' }}>🛒 Your Order</h2>
                  <button onClick={() => setShowCart(false)}
                    style={{ background: '#f5f5f5', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={16} color="#6b7280" />
                  </button>
                </div>
              </div>
              {cart.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>Your cart is empty</p>
              ) : (
                <div style={{ padding: '0 16px 16px' }}>
                  {cart.map(item => {
                    const key = item.id + JSON.stringify(item.selectedCustomizations)
                    return (
                      <div key={key} style={{ padding: '8px 0', borderBottom: '1px solid #f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontWeight: 500, color: '#1a1a1a' }}>{item.name}</p>
                          {Object.values(item.selectedCustomizations).length > 0 && (
                            <p style={{ fontSize: '0.75rem', color: '#f97316' }}>{Object.values(item.selectedCustomizations).join(' · ')}</p>
                          )}
                          <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Rs.{item.price} each</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button onClick={() => removeFromCart(key)} className="btn-scale"
                            style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#fff3ed', color: '#f97316', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Minus size={13} />
                          </button>
                          <span style={{ fontWeight: 700, color: '#1a1a1a', minWidth: '20px', textAlign: 'center' }}>{item.quantity}</span>
                          <button onClick={() => addToCart(item, item.selectedCustomizations)} className="btn-scale"
                            style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f97316', color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', marginBottom: '4px' }}><span>Subtotal</span><span>Rs.{totalPrice}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: '0.85rem', marginBottom: '8px' }}><span>Convenience fee</span><span>Rs.{convenienceFee}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1.1rem', borderTop: '1px dashed #e5e7eb', paddingTop: '8px', color: '#1a1a1a' }}>
                      <span>Total</span><span style={{ color: '#f97316' }}>Rs.{grandTotal}</span>
                    </div>
                  </div>
                  <button onClick={goToCheckout} className="btn-scale"
                    style={{ width: '100%', background: '#f97316', color: 'white', fontWeight: 700, fontSize: '1rem', padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer', marginTop: '12px' }}>
                    Proceed to Pay Rs.{grandTotal} →
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="max-w-2xl mx-auto px-4 py-4">

        {/* ACTIVE ORDERS SLIDER or SLOTS */}
        {activeOrders.length > 0 ? (
          <div className="mb-4">
            <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} style={{ position: 'relative', overflow: 'hidden' }}>
              {activeOrders.map((order, idx) => {
                const info = getOrderStatusInfo(order.status)
                if (idx !== currentOrderIdx) return null
                return (
                  <button key={order.id}
                    onClick={() => window.location.href = '/orders'}
                    className="order-slide order-bar w-full text-left"
                    style={{ background: info.bg, border: `1.5px solid ${info.border}`, borderRadius: '16px', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, background: info.dot, animation: order.status !== 'ready' ? 'pulse 1.5s ease-in-out infinite' : 'none', boxShadow: `0 0 0 3px ${info.dot}33` }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 800, color: '#f97316', fontSize: '0.9rem' }}>#{order.order_number}</span>
                        <span style={{ fontWeight: 600, color: info.text, fontSize: '0.85rem' }}>{info.label}</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Pickup at {formatPickup(order.pickup_time)} · Tap to track</span>
                    </div>
                    <ChevronRight size={18} color="#9ca3af" style={{ flexShrink: 0 }} />
                  </button>
                )
              })}
            </div>
            {activeOrders.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                <button onClick={() => setCurrentOrderIdx(i => Math.max(0, i - 1))}
                  style={{ background: currentOrderIdx === 0 ? '#f3f4f6' : '#f97316', border: 'none', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <ChevronLeft size={14} color={currentOrderIdx === 0 ? '#9ca3af' : 'white'} />
                </button>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {activeOrders.map((_, i) => (
                    <div key={i} onClick={() => setCurrentOrderIdx(i)}
                      style={{ width: i === currentOrderIdx ? '20px' : '8px', height: '8px', borderRadius: '50px', background: i === currentOrderIdx ? '#f97316' : '#e5e7eb', transition: 'all 0.2s ease', cursor: 'pointer' }} />
                  ))}
                </div>
                <button onClick={() => setCurrentOrderIdx(i => Math.min(activeOrders.length - 1, i + 1))}
                  style={{ background: currentOrderIdx === activeOrders.length - 1 ? '#f3f4f6' : '#f97316', border: 'none', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <ChevronRight size={14} color={currentOrderIdx === activeOrders.length - 1 ? '#9ca3af' : 'white'} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-4 mb-4" style={{ border: '1px solid #f0ede8' }}>
            <button onClick={() => setShowSlots(!showSlots)} className="w-full flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Clock size={17} style={{ color: '#f97316' }} />
                <span className="font-semibold text-gray-800">Live Pickup Slots</span>
                <span style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '50px', fontWeight: 600 }}>Live</span>
              </div>
              {showSlots ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
            {showSlots && (
              <div className="mt-3">
                <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '8px' }}>🔥 Rush = 15 min · ✅ Normal = 30 min · Open 10 AM – 7 PM</p>
                <div className="grid grid-cols-2 gap-2" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                  {slots.length === 0 ? (
                    <p className="text-gray-400 text-sm col-span-2 text-center py-2">Loading slots...</p>
                  ) : slots.map(slot => {
                    const s = getSlotStatus(slot)
                    return (
                      <div key={slot.id} className={`border rounded-xl p-2 text-center ${s.color}`}>
                        <p className="font-bold text-sm">{slot.slot_time}</p>
                        <p className="text-xs">{slot.current_orders}/{slot.max_orders} orders</p>
                        <p className="text-xs font-semibold">{s.label}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CATEGORIES */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: 'none' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className="btn-scale whitespace-nowrap"
              style={{ padding: '7px 16px', borderRadius: '50px', fontSize: '0.85rem', fontWeight: 600, background: activeCategory === cat ? '#f97316' : 'white', color: activeCategory === cat ? 'white' : '#6b7280', border: activeCategory === cat ? 'none' : '1.5px solid #e5e7eb', boxShadow: activeCategory === cat ? '0 3px 10px rgba(249,115,22,0.3)' : '0 1px 3px rgba(0,0,0,0.04)' }}>
              {cat}
            </button>
          ))}
        </div>

        {/* MENU ITEMS */}
        <div className="grid grid-cols-1 gap-3">
          {filtered.map(item => {
            const inCart = cart.filter(i => i.id === item.id).reduce((sum, i) => sum + i.quantity, 0)
            return (
              <div key={item.id} className="menu-card bg-white rounded-2xl p-4 flex justify-between items-center" style={{ border: '1px solid #f0ede8' }}>
                <div className="flex-1 pr-3">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{item.name}</h3>
                    {item.prep_time_minutes <= 3 && (
                      <span style={{ background: '#e8f5e9', color: '#2e7d32', fontSize: '0.68rem', padding: '2px 7px', borderRadius: '50px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <Zap size={9} /> Quick
                      </span>
                    )}
                    {item.customizations?.options?.length ? (
                      <span style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: '0.68rem', padding: '2px 7px', borderRadius: '50px', fontWeight: 600 }}>Customisable</span>
                    ) : null}
                  </div>
                  <p className="text-gray-400 text-sm mb-2">{item.description}</p>
                  <div className="flex items-center gap-3">
                    <span className="font-bold" style={{ color: '#f97316', fontSize: '1.1rem' }}>Rs.{item.price}</span>
                    <span className="text-gray-300 text-xs flex items-center gap-1"><Clock size={11} />{item.prep_time_minutes} min</span>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {inCart > 0 ? (
                    <div className="flex items-center gap-2 rounded-2xl px-2 py-1" style={{ border: '1.5px solid #fed7aa', background: '#fff7ed' }}>
                      <button className="btn-scale w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#fff3ed', color: '#f97316' }} onClick={() => removeFromCartSimple(item.id)}><Minus size={14} /></button>
                      <span className="font-bold text-gray-800 w-5 text-center">{inCart}</span>
                      <button className="btn-scale w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#f97316', color: 'white' }} onClick={() => openCustomization(item)}><Plus size={14} /></button>
                    </div>
                  ) : (
                    <button onClick={() => openCustomization(item)} className="btn-scale text-white font-semibold px-4 py-2 rounded-xl text-sm" style={{ background: '#f97316', boxShadow: '0 2px 8px rgba(249,115,22,0.3)' }}>Add</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CUSTOMIZATION MODAL */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)' }}>
          <div className="bg-white w-full max-w-2xl mx-auto rounded-t-3xl p-6" style={{ animation: 'fadeUp 0.25s ease forwards' }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-xl text-gray-900">{customizingItem.name}</h2>
              <button onClick={() => setCustomizingItem(null)} className="btn-scale w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#f5f5f5' }}>
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <p className="font-bold text-xl mb-5" style={{ color: '#f97316' }}>Rs.{customizingItem.price}</p>
            {customizingItem.customizations?.options.map(opt => (
              <div key={opt.name} className="mb-5">
                <p className="font-semibold text-gray-700 mb-2">{opt.name}</p>
                <div className="flex gap-2 flex-wrap">
                  {opt.choices.map(choice => (
                    <button key={choice} onClick={() => setSelectedCustomizations(prev => ({ ...prev, [opt.name]: choice }))}
                      className="btn-scale px-4 py-2 rounded-xl text-sm font-medium"
                      style={{ background: selectedCustomizations[opt.name] === choice ? '#f97316' : '#f8f7f4', color: selectedCustomizations[opt.name] === choice ? 'white' : '#374151', border: selectedCustomizations[opt.name] === choice ? 'none' : '1.5px solid #e5e7eb' }}>
                      {choice}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => addToCart(customizingItem, selectedCustomizations)}
              className="btn-scale w-full text-white font-bold text-lg py-4 rounded-2xl"
              style={{ background: '#f97316', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}>
              Add to Cart — Rs.{customizingItem.price}
            </button>
          </div>
        </div>
      )}

      {/* AI BUTTON */}
      <button onClick={() => setShowAI(!showAI)}
        className="fixed bottom-6 right-5 text-white w-14 h-14 rounded-full flex items-center justify-center z-40"
        style={{ background: '#f97316', boxShadow: '0 4px 18px rgba(249,115,22,0.5)', animation: 'breathe 2.5s ease-in-out infinite' }}>
        <Sparkles size={24} />
      </button>

      {/* AI CHAT */}
      {showAI && (
        <div className="fixed bottom-24 right-4 bg-white rounded-3xl shadow-2xl z-50 flex flex-col"
          style={{ width: '360px', height: '560px', border: '1px solid #f0ede8', animation: 'popIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
          <div className="p-4 rounded-t-3xl flex justify-between items-center flex-shrink-0" style={{ background: '#f97316' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}><Sparkles size={18} color="white" /></div>
              <div>
                <p className="font-bold text-white">CaféQ Assistant</p>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.7rem' }}>Powered by Llama 3.3 · Free AI</p>
              </div>
            </div>
            <button onClick={() => setShowAI(false)} className="btn-scale w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
              <X size={16} color="white" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div style={{ maxWidth: '88%', padding: '9px 13px', fontSize: '0.875rem', lineHeight: 1.5, borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', background: msg.role === 'user' ? '#f97316' : '#f8f7f4', color: msg.role === 'user' ? 'white' : '#1a1a1a' }}>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                </div>
                {msg.role === 'assistant' && msg.items && msg.items.length > 0 && (
                  <div className="mt-2 w-full space-y-2">
                    {msg.items.map((aiItem, j) => {
                      const qty = getCartQtyByName(aiItem.name)
                      return (
                        <div key={j} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                          <div>
                            <p className="font-semibold text-sm text-gray-800">{aiItem.name}</p>
                            <p className="text-xs font-bold" style={{ color: '#f97316' }}>Rs.{aiItem.price}</p>
                          </div>
                          {qty > 0 ? (
                            <div className="flex items-center gap-2">
                              <button onClick={() => removeFromCartByName(aiItem.name)} className="btn-scale w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'white', color: '#f97316', border: '1px solid #fed7aa' }}><Minus size={11} /></button>
                              <span className="font-bold text-sm" style={{ color: '#f97316', minWidth: '1rem', textAlign: 'center' }}>{qty}</span>
                              <button onClick={() => addToCartByName(aiItem)} className="btn-scale w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#f97316', color: 'white' }}><Plus size={11} /></button>
                            </div>
                          ) : (
                            <button onClick={() => addToCartByName(aiItem)} className="btn-scale text-white font-bold px-3 py-1 rounded-lg text-xs" style={{ background: '#f97316' }}>Add</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
            {aiLoading && (
              <div className="flex items-start">
                <div style={{ padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: '#f8f7f4', display: 'flex', gap: '5px', alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (<div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f97316', animation: `dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />))}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 flex gap-2 flex-shrink-0" style={{ borderTop: '1px solid #f0ede8' }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendToAI()}
              placeholder="Ask about menu or slots..." className="chat-input flex-1 rounded-xl px-4 py-3 text-sm"
              style={{ border: '1.5px solid #e5e7eb', color: '#1a1a1a', background: '#fafafa', outline: 'none' }} />
            <button onClick={sendToAI} className="btn-scale flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: '44px', height: '44px', background: '#f97316' }}>
              <Send size={17} color="white" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}