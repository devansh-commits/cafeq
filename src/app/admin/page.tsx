'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LayoutDashboard, ShoppingBag, TrendingUp, UtensilsCrossed,
  LogOut, RefreshCw, Search, ToggleLeft, ToggleRight,
  Printer, Download, Sparkles,
  Send, Users, Trash2, ChevronDown, ChevronUp
} from 'lucide-react'

type Order = {
  id: string; order_number: string; status: string
  total_amount: number; convenience_fee: number
  pickup_time: string; payment_method: string; created_at: string
  users: { name: string; phone: string }
  order_items: { quantity: number; price_at_order: number; menu_items: { name: string } }[]
}
type MenuItem = {
  id: string; name: string; price: number; category: string
  is_available: boolean; prep_time_minutes: number; description: string
}
type ChatMsg = { role: 'user' | 'assistant'; content: string }

const TABS = [
  { id: 'overview', label: 'Home', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'revenue', label: 'Revenue', icon: TrendingUp },
  { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'reports', label: 'Reports', icon: Printer },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'staff', label: 'Staff', icon: Users },
]

function fmt(iso: string) { return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) }
function statusColor(s: string) {
  if (s === 'pending') return { bg: '#fff7ed', text: '#c2410c', dot: '#f97316' }
  if (s === 'preparing') return { bg: '#fefce8', text: '#854d0e', dot: '#eab308' }
  if (s === 'ready') return { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' }
  return { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' }
}
function statusLabel(s: string) {
  if (s === 'pending') return 'Received'
  if (s === 'preparing') return 'Preparing'
  if (s === 'ready') return 'Ready'
  if (s === 'completed') return 'Collected'
  return s
}

/** Supabase sometimes returns embedded FK rows as a single object or as a one-element array. */
function normalizeOrders(raw: unknown[] | null): Order[] {
  if (!raw?.length) return []
  return raw.map((rowUnknown) => {
    const row = rowUnknown as Record<string, unknown>
    let users = row.users as Order['users'] | Order['users'][] | null | undefined
    if (Array.isArray(users)) users = (users[0] as Order['users']) ?? undefined
    const order_items = ((row.order_items as Order['order_items']) || []).map((it) => {
      const line = it as { quantity: number; price_at_order: number; menu_items?: { name: string } | { name: string }[] | null }
      let mi = line.menu_items
      if (Array.isArray(mi)) mi = mi[0] ?? undefined
      return { quantity: line.quantity, price_at_order: line.price_at_order, menu_items: mi }
    })
    return { ...row, users, order_items } as Order
  })
}

function playAlert() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const freqs = [880, 1100, 880]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq; osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.18)
      osc.start(ctx.currentTime + i * 0.2); osc.stop(ctx.currentTime + i * 0.2 + 0.2)
    })
  } catch {}
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState('')
  const [tab, setTab] = useState('overview')
  const [orders, setOrders] = useState<Order[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [orderSearch, setOrderSearch] = useState('')
  const [orderFilter, setOrderFilter] = useState('today')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [priceEdit, setPriceEdit] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [revenueRange, setRevenueRange] = useState<'today' | 'week' | 'month'>('week')
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([
    { role: 'assistant', content: 'Namaste! 👋 I\'m your business assistant. Ask me anything — in Hindi or English!\n\nExamples:\n• "Aaj kitna revenue hua?"\n• "Which item is most popular?"\n• "Compare this week vs last week"' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinSaved, setPinSaved] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', price: '', category: '', description: '', prep_time_minutes: '5' })
  const [addingItem, setAddingItem] = useState(false)
  const prevOrderCount = useRef(0)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sessionStorage.getItem('cafeq_owner') === 'true') setAuthed(true)
  }, [])

  const fetchData = useCallback(async () => {
    const { data: o } = await supabase
      .from('orders')
      .select(`id, order_number, status, total_amount, convenience_fee, pickup_time, payment_method, created_at,
        users(name, phone), order_items(quantity, price_at_order, menu_items(name))`)
      .order('created_at', { ascending: false })
      .limit(1000)
    if (o) {
      const normalized = normalizeOrders(o as unknown[])
      // Alert on new orders
      const todayStr = new Date().toISOString().split('T')[0]
      const todayCount = normalized.filter(x => x.created_at?.startsWith(todayStr)).length
      if (prevOrderCount.current > 0 && todayCount > prevOrderCount.current) playAlert()
      prevOrderCount.current = todayCount
      setOrders(normalized)
    }
    const { data: m } = await supabase.from('menu_items').select('*').order('category').order('name')
    if (m) setMenuItems(m)
    setLastRefresh(new Date())
  }, [])

  useEffect(() => {
    if (!authed) return
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [authed, fetchData])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMsgs])

  function handlePin(digit: string) {
    const next = pin + digit; setPin(next)
    if (next.length === 4) {
      if (next === '9999') { sessionStorage.setItem('cafeq_owner', 'true'); setAuthed(true); setPin('') }
      else { setPinErr('Wrong PIN'); setTimeout(() => { setPinErr(''); setPin('') }, 1200) }
    }
  }

  // ── Computed ──
  const todayStr = new Date().toISOString().split('T')[0]
  const todayOrders = orders.filter(o => o.created_at?.startsWith(todayStr))
  const todayRevenue = todayOrders.reduce((s, o) => s + o.total_amount, 0)
  const todayConvFee = todayOrders.reduce((s, o) => s + (o.convenience_fee || 0), 0)
  const activeNow = todayOrders.filter(o => ['pending', 'preparing', 'ready'].includes(o.status))
  const todayUPI = todayOrders.filter(o => o.payment_method === 'upi').reduce((s, o) => s + o.total_amount, 0)
  const todayCash = todayOrders.filter(o => o.payment_method === 'cash').reduce((s, o) => s + o.total_amount, 0)

  const itemFreq: Record<string, number> = {}
  todayOrders.forEach(o => o.order_items?.forEach(i => {
    const n = i.menu_items?.name || '?'; itemFreq[n] = (itemFreq[n] || 0) + i.quantity
  }))
  const topItem = Object.entries(itemFreq).sort((a, b) => b[1] - a[1])[0]

  const slotFreq: Record<string, number> = {}
  todayOrders.forEach(o => { const s = fmt(o.pickup_time); slotFreq[s] = (slotFreq[s] || 0) + 1 })
  const busiestSlot = Object.entries(slotFreq).sort((a, b) => b[1] - a[1])[0]

  // Revenue chart
  const days = revenueRange === 'today' ? 1 : revenueRange === 'week' ? 7 : 30
  const revenueData = Array.from({ length: days }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (days - 1 - i))
    const dateStr = d.toISOString().split('T')[0]
    const dayOrders = orders.filter(o => o.created_at?.startsWith(dateStr))
    return {
      label: days === 1 ? 'Today' : i === days - 1 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
      revenue: dayOrders.reduce((s, o) => s + o.total_amount, 0),
      count: dayOrders.length, date: dateStr
    }
  })
  const maxRev = Math.max(...revenueData.map(d => d.revenue), 1)

  // Peak hours heatmap (slots × days of week)
  const heatmap: Record<string, number> = {}
  orders.forEach(o => {
    const slot = fmt(o.pickup_time)
    heatmap[slot] = (heatmap[slot] || 0) + 1
  })
  const heatSlots = Object.entries(heatmap).sort((a, b) => {
    return a[0].localeCompare(b[0])
  }).slice(0, 12)
  const maxHeat = Math.max(...heatSlots.map(h => h[1]), 1)

  // Dead stock (items with 0 orders in last 7 days)
  const last7 = new Date(); last7.setDate(last7.getDate() - 7)
  const recentOrders = orders.filter(o => new Date(o.created_at) > last7)
  const orderedItemIds = new Set<string>()
  recentOrders.forEach(o => o.order_items?.forEach(i => {
    const found = menuItems.find(m => m.name === i.menu_items?.name)
    if (found) orderedItemIds.add(found.id)
  }))
  const deadStock = menuItems.filter(m => !orderedItemIds.has(m.id))

  // Filtered orders
  const filteredOrders = orders.filter(o => {
    const matchDate = orderFilter === 'today' ? o.created_at?.startsWith(todayStr)
      : orderFilter === 'active' ? ['pending', 'preparing', 'ready'].includes(o.status)
      : true
    const matchSearch = !orderSearch ||
      o.order_number?.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.users?.name?.toLowerCase().includes(orderSearch.toLowerCase())
    return matchDate && matchSearch
  })

  async function toggleItem(item: MenuItem) {
    setSaving(item.id)
    await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id)
    await fetchData(); setSaving(null)
  }

  async function savePrice(item: MenuItem) {
    const p = parseFloat(priceEdit[item.id])
    if (!p || p <= 0) return
    setSaving(item.id)
    await supabase.from('menu_items').update({ price: p }).eq('id', item.id)
    setPriceEdit(prev => { const n = { ...prev }; delete n[item.id]; return n })
    await fetchData(); setSaving(null)
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item from menu?')) return
    await supabase.from('menu_items').delete().eq('id', id)
    await fetchData()
  }

  async function addMenuItem() {
    if (!newItem.name || !newItem.price || !newItem.category) return
    setAddingItem(true)
    await supabase.from('menu_items').insert({
      name: newItem.name, price: parseFloat(newItem.price),
      category: newItem.category, description: newItem.description,
      prep_time_minutes: parseInt(newItem.prep_time_minutes) || 5,
      is_available: true
    })
    setNewItem({ name: '', price: '', category: '', description: '', prep_time_minutes: '5' })
    await fetchData(); setAddingItem(false)
  }

  function printOrder(order: Order) {
    const subtotal = order.total_amount - (order.convenience_fee || 0)
    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return
    win.document.write(`<html><head><style>
      body{font-family:'Courier New',monospace;font-size:13px;width:76mm;margin:0;padding:4mm;}
      .c{text-align:center}.b{font-weight:bold}.big{font-size:22px;font-weight:900}
      .line{border-top:1px dashed #000;margin:5px 0}.row{display:flex;justify-content:space-between}
      .item{padding:3px 0;border-bottom:1px dotted #ccc}
    </style></head><body>
    <div class="c b" style="font-size:15px">☕ CaféQ</div>
    <div class="line"></div>
    <div class="c big">#${order.order_number}</div>
    <div class="c b">Pickup: ${fmt(order.pickup_time)}</div>
    <div class="line"></div>
    <div><b>Customer:</b> ${order.users?.name}</div>
    <div>Phone: ${order.users?.phone}</div>
    <div><b>Date:</b> ${fmtDate(order.created_at)}</div>
    <div class="line"></div>
    ${order.order_items?.map(i => `<div class="item row"><span>${i.menu_items?.name} ×${i.quantity}</span><span>Rs.${i.price_at_order * i.quantity}</span></div>`).join('')}
    <div class="line"></div>
    <div class="row"><span>Subtotal</span><span>Rs.${subtotal}</span></div>
    <div class="row"><span>Convenience fee</span><span>Rs.${order.convenience_fee || 0}</span></div>
    <div class="line"></div>
    <div class="row b" style="font-size:15px"><span>TOTAL</span><span>Rs.${order.total_amount}</span></div>
    <div>Payment: ${order.payment_method === 'cash' ? 'Pay at counter' : 'UPI'}</div>
    <div class="line"></div>
    <div class="c" style="font-size:10px">Thank you! ☕ cafeq.app</div>
    </body></html>`)
    win.document.close(); win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  function downloadCSV(data: Order[], filename: string) {
    const rows = [['Token', 'Customer', 'Phone', 'Items', 'Amount', 'Fee', 'Payment', 'Slot', 'Status', 'Date']]
    data.forEach(o => rows.push([
      o.order_number, o.users?.name, o.users?.phone,
      o.order_items?.map(i => `${i.menu_items?.name}×${i.quantity}`).join(' + '),
      String(o.total_amount), String(o.convenience_fee || 0),
      o.payment_method, fmt(o.pickup_time), o.status, fmtDate(o.created_at)
    ]))
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  async function sendToAI() {
    if (!chatInput.trim()) return
    const userMsg = chatInput.trim(); setChatInput('')
    setChatMsgs(prev => [...prev, { role: 'user', content: userMsg }])
    setAiLoading(true)

    // Build rich context
    const totalRev7 = revenueData.reduce((s, d) => s + d.revenue, 0)
    const itemStats = Object.entries(itemFreq).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, count]) => `${name}: ${count}x`).join(', ')
    const weekData = revenueData.map(d => `${d.label}: Rs.${d.revenue} (${d.count} orders)`).join('\n')
    const lastWeekRevenue = (() => {
      let sum = 0
      for (let i = 7; i < 14; i++) {
        const d = new Date(); d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().split('T')[0]
        sum += orders.filter(o => o.created_at?.startsWith(dateStr)).reduce((s, o) => s + o.total_amount, 0)
      }
      return sum
    })()

    const context = `You are a helpful business assistant for a café called CaféQ. Answer in the same language the owner uses (Hindi or English). Be concise and friendly.

BUSINESS DATA:
- Today's revenue: Rs.${todayRevenue} (${todayOrders.length} orders)
- Active orders right now: ${activeNow.length}
- Top item today: ${topItem ? `${topItem[0]} (${topItem[1]}x)` : 'No orders yet'}
- UPI: Rs.${todayUPI} | Cash: Rs.${todayCash}
- This week revenue: Rs.${totalRev7}
- Last week revenue: Rs.${lastWeekRevenue}
- Week breakdown:\n${weekData}
- Top items overall: ${itemStats}
- Dead stock (no orders in 7 days): ${deadStock.map(m => m.name).join(', ') || 'None'}
- Busiest slot today: ${busiestSlot ? `${busiestSlot[0]} (${busiestSlot[1]} orders)` : 'N/A'}
- Total menu items: ${menuItems.length} (${menuItems.filter(m => m.is_available).length} available)`

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...chatMsgs.map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userMsg }],
          menuContext: context, slotContext: ''
        })
      })
      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content || 'Sorry, try again!'
      setChatMsgs(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setChatMsgs(prev => [...prev, { role: 'assistant', content: 'Network error. Please try again.' }])
    }
    setAiLoading(false)
  }

  // ── PIN SCREEN ──
  if (!authed) return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <style>{`.pb{width:70px;height:70px;border-radius:50%;background:#1a1a1a;color:white;font-size:1.4rem;font-weight:700;cursor:pointer;border:1.5px solid #2a2a2a;transition:all .15s} .pb:active{background:#f97316;transform:scale(.92)}`}</style>
      <div style={{ textAlign: 'center', width: '100%', maxWidth: 300 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>☕</div>
        <h1 style={{ color: 'white', fontWeight: 900, fontSize: '1.5rem', marginBottom: 4 }}>Owner Panel</h1>
        <p style={{ color: '#6b7280', fontSize: '0.82rem', marginBottom: 28 }}>Enter your PIN</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 28 }}>
          {[0,1,2,3].map(i => <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: pin.length > i ? '#f97316' : '#2a2a2a', transition: 'all .2s' }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, justifyItems: 'center', marginBottom: 12 }}>
          {[1,2,3,4,5,6,7,8,9].map(n => <button key={n} className="pb" onClick={() => pin.length < 4 && handlePin(String(n))}>{n}</button>)}
          <div />
          <button className="pb" onClick={() => pin.length < 4 && handlePin('0')}>0</button>
          <button className="pb" onClick={() => setPin(p => p.slice(0,-1))} style={{ fontSize: '1rem' }}>⌫</button>
        </div>
        {pinErr && <p style={{ color: '#ef4444', marginTop: 8, fontSize: '0.85rem', fontWeight: 600 }}>{pinErr}</p>}
      </div>
    </div>
  )

  // ── MAIN DASHBOARD ──
  return (
    <div style={{ minHeight: '100vh', background: '#f8f7f4', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes dot{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .card{background:white;border-radius:18px;border:1px solid #f0ede8;padding:18px;}
        .inp{border:1.5px solid #e5e7eb;border-radius:12px;padding:10px 14px;font-size:0.9rem;color:#1a1a1a;background:#fafafa;outline:none;width:100%;font-family:inherit;}
        .inp:focus{border-color:#f97316;}
        .tab-btn{border:none;cursor:pointer;padding:10px 14px;font-weight:600;font-size:0.82rem;display:flex;align-items:center;gap:6px;transition:all .2s;border-radius:12px;white-space:nowrap;}
        .pill{padding:7px 16px;border-radius:50px;border:none;font-weight:600;font-size:0.82rem;cursor:pointer;transition:all .15s;}
        .badge{border-radius:50px;padding:2px 8px;font-size:0.7rem;font-weight:700;}
        .btn-primary{background:#f97316;color:white;border:none;border-radius:12px;padding:10px 18px;font-weight:700;font-size:0.9rem;cursor:pointer;font-family:inherit;}
        .btn-secondary{background:#f3f4f6;color:#374151;border:none;border-radius:12px;padding:10px 18px;font-weight:600;font-size:0.85rem;cursor:pointer;font-family:inherit;}
        @media(min-width:768px){
          .mobile-header{display:none!important;}
          .bottom-nav{display:none!important;}
          .sidebar{display:flex!important;}
          .main-wrap{margin-left:200px!important;padding-top:0!important;}
        }
      `}</style>

      {/* SIDEBAR — desktop */}
      <div className="sidebar" style={{ display:'none', position:'fixed', top:0, left:0, width:200, height:'100vh', background:'white', borderRight:'1px solid #f0ede8', flexDirection:'column', padding:'20px 12px', zIndex:40 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:28, padding:'0 4px' }}>
          <span style={{ fontSize:'1.4rem' }}>☕</span>
          <div>
            <p style={{ fontWeight:900, color:'#f97316', fontSize:'1rem', lineHeight:1 }}>CaféQ</p>
            <p style={{ color:'#9ca3af', fontSize:'0.65rem' }}>Owner Panel</p>
          </div>
        </div>
        {TABS.map(t => (
          <button key={t.id} className="tab-btn" onClick={() => setTab(t.id)}
            style={{ background: tab===t.id ? '#fff7ed' : 'transparent', color: tab===t.id ? '#f97316' : '#6b7280', marginBottom:4, justifyContent:'flex-start', width:'100%' }}>
            <t.icon size={17} /> {t.label}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ borderTop:'1px solid #f0ede8', paddingTop:12 }}>
          <p style={{ fontSize:'0.68rem', color:'#9ca3af', marginBottom:4 }}>Updated {lastRefresh.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}</p>
          <button onClick={fetchData} className="btn-secondary" style={{ width:'100%', marginBottom:6, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={() => { sessionStorage.removeItem('cafeq_owner'); setAuthed(false) }}
            className="btn-secondary" style={{ width:'100%', color:'#ef4444', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <LogOut size={13} /> Logout
          </button>
        </div>
      </div>

      {/* MOBILE HEADER */}
      <div className="mobile-header" style={{ background:'#f97316', padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:30 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:'1.4rem' }}>☕</span>
          <div>
            <p style={{ fontWeight:900, color:'white', fontSize:'1rem', lineHeight:1 }}>CaféQ</p>
            <p style={{ color:'rgba(255,255,255,0.8)', fontSize:'0.65rem' }}>Owner Panel</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={fetchData} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:'50%', width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <RefreshCw size={15} color="white" />
          </button>
          <button onClick={() => { sessionStorage.removeItem('cafeq_owner'); setAuthed(false) }}
            style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:'50%', width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <LogOut size={15} color="white" />
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="main-wrap" style={{ marginLeft:0, paddingTop:0, paddingBottom:80 }}>
        <div style={{ padding:'20px 16px', maxWidth:860, margin:'0 auto' }}>

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div style={{ animation:'fadeUp .3s ease' }}>
              <div style={{ marginBottom:20 }}>
                <h2 style={{ fontWeight:800, fontSize:'1.4rem', color:'#1a1a1a' }}>Good day! 👋</h2>
                <p style={{ color:'#9ca3af', fontSize:'0.82rem', marginTop:2 }}>Here's your café today</p>
              </div>

              {/* Stat cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:14 }}>
                {[
                  { icon:'💰', label:'Revenue Today', value:`Rs.${todayRevenue}`, sub:`Fees: Rs.${todayConvFee}`, color:'#f97316' },
                  { icon:'🧾', label:'Total Orders', value:String(todayOrders.length), sub:`${activeNow.length} active now`, color: activeNow.length > 0 ? '#f97316' : '#22c55e' },
                  { icon:'⏳', label:'Pending Now', value:String(activeNow.length), sub:'Need attention', color: activeNow.length > 0 ? '#eab308' : '#22c55e' },
                  { icon:'🏆', label:'Top Item', value:topItem?.[0] || '—', sub:topItem ? `${topItem[1]}x ordered` : 'No orders yet', color:'#3b82f6' },
                ].map((s, i) => (
                  <div key={i} className="card" style={{ padding:16 }}>
                    <p style={{ fontSize:'1.4rem', marginBottom:4 }}>{s.icon}</p>
                    <p style={{ fontWeight:900, fontSize:'1.3rem', color:s.color, lineHeight:1, wordBreak:'break-word' }}>{s.value}</p>
                    <p style={{ color:'#9ca3af', fontSize:'0.72rem', marginTop:3, fontWeight:600 }}>{s.label}</p>
                    <p style={{ color:'#6b7280', fontSize:'0.68rem', marginTop:2 }}>{s.sub}</p>
                  </div>
                ))}
              </div>

              {/* Busiest slot + payment */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                <div className="card" style={{ padding:16 }}>
                  <p style={{ fontSize:'1.2rem', marginBottom:4 }}>⏰</p>
                  <p style={{ fontWeight:800, fontSize:'1rem', color:'#1a1a1a' }}>{busiestSlot?.[0] || '—'}</p>
                  <p style={{ color:'#9ca3af', fontSize:'0.72rem', marginTop:2 }}>Busiest Slot</p>
                  <p style={{ color:'#6b7280', fontSize:'0.68rem' }}>{busiestSlot ? `${busiestSlot[1]} orders` : 'No data'}</p>
                </div>
                <div className="card" style={{ padding:16 }}>
                  <p style={{ fontSize:'1.2rem', marginBottom:6 }}>💳</p>
                  <div style={{ display:'flex', height:8, borderRadius:50, overflow:'hidden', marginBottom:6 }}>
                    <div style={{ flex:todayUPI, background:'#f97316', transition:'flex .5s', minWidth: todayUPI > 0 ? 4 : 0 }} />
                    <div style={{ flex:todayCash, background:'#e5e7eb', transition:'flex .5s', minWidth: todayCash > 0 ? 4 : 0 }} />
                  </div>
                  <p style={{ color:'#f97316', fontSize:'0.72rem', fontWeight:700 }}>📱 Rs.{todayUPI} UPI</p>
                  <p style={{ color:'#9ca3af', fontSize:'0.68rem' }}>💵 Rs.{todayCash} Cash</p>
                </div>
              </div>

              {/* Live order feed */}
              <div className="card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <div>
                    <p style={{ fontWeight:700, color:'#1a1a1a', fontSize:'1rem' }}>📋 Today's Orders</p>
                    <p style={{ color:'#9ca3af', fontSize:'0.72rem', marginTop:2 }}>Auto-updates every 10s</p>
                  </div>
                  <button onClick={() => setTab('orders')} style={{ background:'#fff7ed', border:'none', borderRadius:8, padding:'5px 12px', color:'#f97316', fontWeight:700, fontSize:'0.75rem', cursor:'pointer' }}>
                    See All
                  </button>
                </div>
                {todayOrders.slice(0,8).map(o => {
                  const sc = statusColor(o.status)
                  return (
                    <div key={o.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid #f9f9f9' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:sc.dot, flexShrink:0, animation: o.status==='pending'?'pulse 1.5s infinite':'none' }} />
                        <div>
                          <p style={{ fontWeight:700, color:'#1a1a1a', fontSize:'0.85rem' }}>#{o.order_number} · {o.users?.name}</p>
                          <p style={{ color:'#9ca3af', fontSize:'0.7rem' }}>
                            {o.order_items?.map(i => `${i.menu_items?.name}×${i.quantity}`).join(', ')}
                          </p>
                          <p style={{ color:'#c4c4c4', fontSize:'0.67rem' }}>{fmt(o.pickup_time)} · {o.payment_method==='cash'?'💵 Cash':'📱 UPI'}</p>
                        </div>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <p style={{ fontWeight:800, color:'#f97316', fontSize:'0.88rem' }}>Rs.{o.total_amount}</p>
                        <span className="badge" style={{ background:sc.bg, color:sc.text }}>{statusLabel(o.status)}</span>
                      </div>
                    </div>
                  )
                })}
                {todayOrders.length===0 && <p style={{ textAlign:'center', color:'#9ca3af', padding:'20px 0' }}>No orders today yet</p>}
              </div>
            </div>
          )}

          {/* ── ORDERS ── */}
          {tab === 'orders' && (
            <div style={{ animation:'fadeUp .3s ease' }}>
              <h2 style={{ fontWeight:800, fontSize:'1.4rem', color:'#1a1a1a', marginBottom:16 }}>All Orders</h2>
              <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
                {[['today','Today'],['active','Active Now'],['all','All Time']].map(([v,l]) => (
                  <button key={v} className="pill" onClick={() => setOrderFilter(v)}
                    style={{ background:orderFilter===v?'#f97316':'white', color:orderFilter===v?'white':'#6b7280', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>{l}</button>
                ))}
              </div>
              <div style={{ position:'relative', marginBottom:14 }}>
                <Search size={15} color="#9ca3af" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }} />
                <input className="inp" placeholder="Search name or token..." value={orderSearch} onChange={e => setOrderSearch(e.target.value)} style={{ paddingLeft:34 }} />
              </div>
              <p style={{ color:'#9ca3af', fontSize:'0.75rem', marginBottom:12 }}>{filteredOrders.length} orders</p>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {filteredOrders.map(o => {
                  const sc = statusColor(o.status); const isEx = expandedOrder===o.id
                  return (
                    <div key={o.id} className="card" style={{ padding:0, overflow:'hidden' }}>
                      <button onClick={() => setExpandedOrder(isEx?null:o.id)}
                        style={{ width:'100%', padding:'14px 16px', background:'none', border:'none', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', textAlign:'left' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:9, height:9, borderRadius:'50%', background:sc.dot, flexShrink:0 }} />
                          <div>
                            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                              <p style={{ fontWeight:800, color:'#f97316', fontSize:'0.88rem' }}>#{o.order_number}</p>
                              <span className="badge" style={{ background:sc.bg, color:sc.text }}>{statusLabel(o.status)}</span>
                            </div>
                            <p style={{ fontWeight:600, color:'#374151', fontSize:'0.83rem', marginTop:2 }}>{o.users?.name}</p>
                            <p style={{ color:'#9ca3af', fontSize:'0.7rem' }}>{fmtDate(o.created_at)} · {fmt(o.pickup_time)} · {o.payment_method==='cash'?'💵':'📱'}</p>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div>
                            <p style={{ fontWeight:800, color:'#f97316', fontSize:'0.9rem', textAlign:'right' }}>Rs.{o.total_amount}</p>
                            <button onClick={e => { e.stopPropagation(); printOrder(o) }}
                              style={{ background:'#f3f4f6', border:'none', borderRadius:6, padding:'2px 8px', fontSize:'0.68rem', color:'#6b7280', cursor:'pointer', marginTop:3, display:'flex', alignItems:'center', gap:3 }}>
                              <Printer size={10} /> Print
                            </button>
                          </div>
                          {isEx ? <ChevronUp size={15} color="#9ca3af" /> : <ChevronDown size={15} color="#9ca3af" />}
                        </div>
                      </button>
                      {isEx && (
                        <div style={{ borderTop:'1px solid #f5f5f5', padding:'12px 16px', background:'#fafafa' }}>
                          {o.order_items?.map((item, j) => (
                            <div key={j} style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                              <p style={{ color:'#6b7280', fontSize:'0.83rem' }}>{item.menu_items?.name} × {item.quantity}</p>
                              <p style={{ fontWeight:600, color:'#374151', fontSize:'0.83rem' }}>Rs.{item.price_at_order * item.quantity}</p>
                            </div>
                          ))}
                          <div style={{ borderTop:'1px dashed #e5e7eb', marginTop:8, paddingTop:8 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                              <p style={{ color:'#9ca3af', fontSize:'0.75rem' }}>Subtotal</p>
                              <p style={{ color:'#6b7280', fontSize:'0.75rem' }}>Rs.{o.total_amount-(o.convenience_fee||0)}</p>
                            </div>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                              <p style={{ color:'#9ca3af', fontSize:'0.75rem' }}>Convenience fee</p>
                              <p style={{ color:'#6b7280', fontSize:'0.75rem' }}>Rs.{o.convenience_fee||0}</p>
                            </div>
                            <div style={{ display:'flex', justifyContent:'space-between' }}>
                              <p style={{ fontWeight:700, color:'#374151', fontSize:'0.85rem' }}>Total</p>
                              <p style={{ fontWeight:800, color:'#f97316', fontSize:'0.85rem' }}>Rs.{o.total_amount}</p>
                            </div>
                          </div>
                          {o.users?.phone && <p style={{ color:'#9ca3af', fontSize:'0.7rem', marginTop:8 }}>📞 {o.users.phone}</p>}
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredOrders.length===0 && (
                  <div style={{ textAlign:'center', padding:'40px 0' }}>
                    <p style={{ fontSize:'2rem', marginBottom:8 }}>📭</p>
                    <p style={{ color:'#9ca3af' }}>No orders found</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── REVENUE ── */}
          {tab === 'revenue' && (
            <div style={{ animation:'fadeUp .3s ease' }}>
              <h2 style={{ fontWeight:800, fontSize:'1.4rem', color:'#1a1a1a', marginBottom:16 }}>Revenue</h2>
              <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
                {([['today','Today'],['week','This Week'],['month','This Month']] as const).map(([v,l]) => (
                  <button key={v} className="pill" onClick={() => setRevenueRange(v)}
                    style={{ background:revenueRange===v?'#f97316':'white', color:revenueRange===v?'white':'#6b7280', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>{l}</button>
                ))}
              </div>

              {/* Summary */}
              <div className="card" style={{ marginBottom:14, display:'flex', justifyContent:'space-between' }}>
                <div>
                  <p style={{ color:'#9ca3af', fontSize:'0.78rem' }}>Total Revenue</p>
                  <p style={{ fontWeight:900, fontSize:'1.8rem', color:'#f97316', lineHeight:1.1 }}>Rs.{revenueData.reduce((s,d)=>s+d.revenue,0)}</p>
                </div>
                <div style={{ textAlign:'right' }}>
                  <p style={{ color:'#9ca3af', fontSize:'0.78rem' }}>Total Orders</p>
                  <p style={{ fontWeight:900, fontSize:'1.8rem', color:'#1a1a1a', lineHeight:1.1 }}>{revenueData.reduce((s,d)=>s+d.count,0)}</p>
                </div>
              </div>

              {/* Bar chart */}
              <div className="card" style={{ marginBottom:14 }}>
                <p style={{ fontWeight:700, color:'#1a1a1a', marginBottom:14, fontSize:'0.95rem' }}>📊 Revenue Chart</p>
                <div style={{ display:'flex', gap:revenueRange==='month'?3:6, alignItems:'flex-end', height:140, overflowX:'auto', paddingBottom:4 }}>
                  {revenueData.map((d,i) => (
                    <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0, flex:1, minWidth:revenueRange==='month'?18:36 }}>
                      {d.revenue > 0 && <p style={{ color:'#f97316', fontSize:'0.55rem', fontWeight:700, whiteSpace:'nowrap' }}>Rs.{d.revenue}</p>}
                      <div style={{ width:'100%', background:d.date===todayStr?'#f97316':'#fed7aa', borderRadius:'5px 5px 0 0', height:`${Math.max(d.revenue/maxRev*100,d.revenue>0?4:0)}px`, transition:'height .5s', minHeight:d.revenue>0?4:0 }} />
                      <p style={{ color:'#9ca3af', fontSize:'0.55rem', fontWeight:600, textAlign:'center', lineHeight:1.2 }}>{d.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Peak hours heatmap */}
              <div className="card" style={{ marginBottom:14 }}>
                <p style={{ fontWeight:700, color:'#1a1a1a', marginBottom:14, fontSize:'0.95rem' }}>🔥 Peak Hours (All Time)</p>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {heatSlots.map(([slot, count]) => (
                    <div key={slot} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <p style={{ color:'#6b7280', fontSize:'0.78rem', width:60, flexShrink:0 }}>{slot}</p>
                      <div style={{ flex:1, height:20, background:'#f3f4f6', borderRadius:6, overflow:'hidden' }}>
                        <div style={{ height:'100%', background:`rgba(249,115,22,${0.3 + (count/maxHeat)*0.7})`, width:`${count/maxHeat*100}%`, borderRadius:6, transition:'width .5s', display:'flex', alignItems:'center', paddingLeft:6 }}>
                          <p style={{ color:'white', fontSize:'0.65rem', fontWeight:700 }}>{count}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top items */}
              <div className="card">
                <p style={{ fontWeight:700, color:'#1a1a1a', marginBottom:14, fontSize:'0.95rem' }}>🏆 Top Items</p>
                {(() => {
                  const freq: Record<string,number> = {}
                  revenueData.forEach(d => orders.filter(o=>o.created_at?.startsWith(d.date)).forEach(o=>o.order_items?.forEach(i=>{
                    const n=i.menu_items?.name||'?'; freq[n]=(freq[n]||0)+i.quantity
                  })))
                  const sorted = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,8)
                  const max = sorted[0]?.[1]||1
                  return sorted.map(([name,count],i) => (
                    <div key={name} style={{ marginBottom:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <p style={{ fontWeight:600, color:'#374151', fontSize:'0.83rem' }}>{i+1}. {name}</p>
                        <p style={{ fontWeight:700, color:'#f97316', fontSize:'0.83rem' }}>{count}×</p>
                      </div>
                      <div style={{ height:5, background:'#f3f4f6', borderRadius:50 }}>
                        <div style={{ height:5, background:i===0?'#f97316':'#fed7aa', borderRadius:50, width:`${count/max*100}%`, transition:'width .5s' }} />
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}

          {/* ── MENU ── */}
          {tab === 'menu' && (
            <div style={{ animation:'fadeUp .3s ease' }}>
              <h2 style={{ fontWeight:800, fontSize:'1.4rem', color:'#1a1a1a', marginBottom:4 }}>Menu</h2>
              <p style={{ color:'#9ca3af', fontSize:'0.82rem', marginBottom:16 }}>Toggle · Change price · Mark sold out</p>

              {/* Dead stock warning */}
              {deadStock.length > 0 && (
                <div style={{ background:'#fefce8', border:'1px solid #fde68a', borderRadius:14, padding:'12px 14px', marginBottom:16, display:'flex', alignItems:'flex-start', gap:10 }}>
                  <p style={{ fontSize:'1.2rem' }}>⚠️</p>
                  <div>
                    <p style={{ fontWeight:700, color:'#854d0e', fontSize:'0.85rem' }}>Dead Stock — No orders in 7 days</p>
                    <p style={{ color:'#a16207', fontSize:'0.78rem', marginTop:3 }}>{deadStock.map(m=>m.name).join(', ')}</p>
                    <p style={{ color:'#ca8a04', fontSize:'0.72rem', marginTop:3 }}>Consider removing or promoting these items</p>
                  </div>
                </div>
              )}

              {/* Add new item */}
              <div className="card" style={{ marginBottom:16 }}>
                <p style={{ fontWeight:700, color:'#1a1a1a', marginBottom:12, fontSize:'0.95rem' }}>➕ Add New Item</p>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                  <input className="inp" placeholder="Item name *" value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} />
                  <input className="inp" placeholder="Price (Rs.) *" type="number" value={newItem.price} onChange={e=>setNewItem(p=>({...p,price:e.target.value}))} />
                  <input className="inp" placeholder="Category * (e.g. Snacks)" value={newItem.category} onChange={e=>setNewItem(p=>({...p,category:e.target.value}))} />
                  <input className="inp" placeholder="Prep time (min)" type="number" value={newItem.prep_time_minutes} onChange={e=>setNewItem(p=>({...p,prep_time_minutes:e.target.value}))} />
                </div>
                <input className="inp" placeholder="Description" value={newItem.description} onChange={e=>setNewItem(p=>({...p,description:e.target.value}))} style={{ marginBottom:10 }} />
                <button onClick={addMenuItem} disabled={addingItem || !newItem.name || !newItem.price || !newItem.category} className="btn-primary" style={{ opacity: (!newItem.name||!newItem.price||!newItem.category)?0.5:1 }}>
                  {addingItem ? 'Adding...' : 'Add to Menu'}
                </button>
              </div>

              {/* Menu items grouped by category */}
              {Array.from(new Set(menuItems.map(m=>m.category))).map(cat => (
                <div key={cat} style={{ marginBottom:18 }}>
                  <p style={{ fontWeight:700, color:'#6b7280', fontSize:'0.75rem', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>{cat}</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {menuItems.filter(m=>m.category===cat).map(item => (
                      <div key={item.id} className="card" style={{ padding:'14px 16px', opacity:item.is_available?1:0.55 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                          <div style={{ flex:1 }}>
                            <p style={{ fontWeight:700, color:'#1a1a1a', fontSize:'0.95rem' }}>{item.name}</p>
                            {item.description && <p style={{ color:'#9ca3af', fontSize:'0.75rem', marginTop:2 }}>{item.description}</p>}
                            <p style={{ color:'#9ca3af', fontSize:'0.7rem', marginTop:2 }}>⏱ {item.prep_time_minutes} min</p>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                            <button onClick={() => deleteItem(item.id)} style={{ background:'#fef2f2', border:'none', borderRadius:8, padding:'6px', cursor:'pointer', display:'flex', alignItems:'center' }}>
                              <Trash2 size={14} color="#ef4444" />
                            </button>
                            <button onClick={() => toggleItem(item)} disabled={saving===item.id} style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
                              {item.is_available ? <ToggleRight size={34} color="#22c55e" /> : <ToggleLeft size={34} color="#d1d5db" />}
                            </button>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, flexWrap:'wrap' }}>
                          {priceEdit[item.id] !== undefined ? (
                            <>
                              <input className="inp" type="number" value={priceEdit[item.id]}
                                onChange={e=>setPriceEdit(p=>({...p,[item.id]:e.target.value}))}
                                style={{ width:80, padding:'5px 10px', fontSize:'0.85rem' }} />
                              <button onClick={()=>savePrice(item)} className="btn-primary" style={{ padding:'5px 12px', fontSize:'0.78rem' }}>Save</button>
                              <button onClick={()=>setPriceEdit(p=>{const n={...p};delete n[item.id];return n})} className="btn-secondary" style={{ padding:'5px 12px', fontSize:'0.78rem' }}>Cancel</button>
                            </>
                          ) : (
                            <button onClick={()=>setPriceEdit(p=>({...p,[item.id]:String(item.price)}))}
                              style={{ background:'#fff7ed', color:'#f97316', border:'none', borderRadius:8, padding:'5px 12px', fontWeight:700, fontSize:'0.83rem', cursor:'pointer' }}>
                              Rs.{item.price} ✏️
                            </button>
                          )}
                          <button onClick={()=>toggleItem(item)} disabled={saving===item.id}
                            style={{ background:!item.is_available?'#fef2f2':'#f3f4f6', color:!item.is_available?'#ef4444':'#6b7280', border:'none', borderRadius:8, padding:'5px 12px', fontWeight:600, fontSize:'0.75rem', cursor:'pointer' }}>
                            {!item.is_available ? '🚫 Sold Out' : '✅ Available'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── REPORTS ── */}
          {tab === 'reports' && (
            <div style={{ animation:'fadeUp .3s ease' }}>
              <h2 style={{ fontWeight:800, fontSize:'1.4rem', color:'#1a1a1a', marginBottom:16 }}>Reports & Invoices</h2>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
                {[
                  { icon:'📅', title:'Today\'s Report', sub:`${todayOrders.length} orders · Rs.${todayRevenue}`, action:()=>downloadCSV(todayOrders,`cafeq-today-${todayStr}.csv`), label:'Download CSV' },
                  { icon:'📊', title:'This Week', sub:`${revenueData.reduce((s,d)=>s+d.count,0)} orders`, action:()=>{
                    const weekOrders = orders.filter(o=>{const d=new Date(o.created_at);const now=new Date();return (now.getTime()-d.getTime())<7*24*60*60*1000})
                    downloadCSV(weekOrders,`cafeq-week.csv`)
                  }, label:'Download CSV' },
                  { icon:'📈', title:'This Month', sub:'Full month data', action:()=>{
                    const m=new Date().getMonth(); const y=new Date().getFullYear()
                    const monthOrders=orders.filter(o=>new Date(o.created_at).getMonth()===m&&new Date(o.created_at).getFullYear()===y)
                    downloadCSV(monthOrders,`cafeq-month-${y}-${m+1}.csv`)
                  }, label:'Download CSV' },
                  { icon:'📋', title:'All Orders', sub:`${orders.length} total orders`, action:()=>downloadCSV(orders,'cafeq-all-orders.csv'), label:'Download CSV' },
                ].map((r,i) => (
                  <div key={i} className="card" style={{ padding:16 }}>
                    <p style={{ fontSize:'1.5rem', marginBottom:6 }}>{r.icon}</p>
                    <p style={{ fontWeight:700, color:'#1a1a1a', fontSize:'0.88rem' }}>{r.title}</p>
                    <p style={{ color:'#9ca3af', fontSize:'0.72rem', marginTop:2, marginBottom:10 }}>{r.sub}</p>
                    <button onClick={r.action} className="btn-primary" style={{ width:'100%', padding:'8px', fontSize:'0.78rem', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
                      <Download size={13} /> {r.label}
                    </button>
                  </div>
                ))}
              </div>

              {/* Print individual orders */}
              <div className="card">
                <p style={{ fontWeight:700, color:'#1a1a1a', marginBottom:14, fontSize:'0.95rem' }}>🖨️ Print Invoice</p>
                <div style={{ position:'relative', marginBottom:12 }}>
                  <Search size={15} color="#9ca3af" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)' }} />
                  <input className="inp" placeholder="Search order to print..." value={orderSearch} onChange={e=>setOrderSearch(e.target.value)} style={{ paddingLeft:34 }} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:300, overflowY:'auto' }}>
                  {orders.filter(o=>!orderSearch||o.order_number?.toLowerCase().includes(orderSearch.toLowerCase())||o.users?.name?.toLowerCase().includes(orderSearch.toLowerCase())).slice(0,20).map(o => (
                    <div key={o.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', background:'#f9fafb', borderRadius:10 }}>
                      <div>
                        <p style={{ fontWeight:700, color:'#1a1a1a', fontSize:'0.85rem' }}>#{o.order_number} · {o.users?.name}</p>
                        <p style={{ color:'#9ca3af', fontSize:'0.7rem' }}>{fmtDate(o.created_at)} · Rs.{o.total_amount}</p>
                      </div>
                      <button onClick={()=>printOrder(o)} style={{ background:'#f97316', border:'none', borderRadius:8, padding:'6px 12px', color:'white', fontWeight:700, fontSize:'0.75rem', cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                        <Printer size={12} /> Print
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── AI ASSISTANT ── */}
          {tab === 'ai' && (
            <div style={{ animation:'fadeUp .3s ease' }}>
              <h2 style={{ fontWeight:800, fontSize:'1.4rem', color:'#1a1a1a', marginBottom:4 }}>AI Assistant ✨</h2>
              <p style={{ color:'#9ca3af', fontSize:'0.82rem', marginBottom:16 }}>Ask anything in Hindi or English</p>

              {/* Suggestions */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
                {[
                  'Aaj kitna revenue hua?',
                  'Best selling item?',
                  'Compare this week vs last',
                  'Dead stock items?',
                  'Busiest time of day?',
                ].map(q => (
                  <button key={q} onClick={() => { setChatInput(q) }}
                    style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:50, padding:'5px 12px', fontSize:'0.75rem', color:'#c2410c', fontWeight:600, cursor:'pointer' }}>
                    {q}
                  </button>
                ))}
              </div>

              {/* Chat */}
              <div className="card" style={{ padding:0, overflow:'hidden' }}>
                <div style={{ height:420, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:10 }}>
                  {chatMsgs.map((m,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:m.role==='user'?'flex-end':'flex-start' }}>
                      <div style={{ maxWidth:'88%', padding:'10px 14px', borderRadius:m.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px', background:m.role==='user'?'#f97316':'#f8f7f4', color:m.role==='user'?'white':'#1a1a1a', fontSize:'0.875rem', lineHeight:1.5, whiteSpace:'pre-wrap' }}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div style={{ display:'flex' }}>
                      <div style={{ padding:'10px 14px', borderRadius:'16px 16px 16px 4px', background:'#f8f7f4', display:'flex', gap:5, alignItems:'center' }}>
                        {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#f97316', animation:`dot 1.2s ease-in-out ${i*.2}s infinite` }} />)}
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div style={{ padding:'12px 14px', borderTop:'1px solid #f0ede8', display:'flex', gap:8 }}>
                  <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendToAI()}
                    placeholder="Ask about your business..." className="inp"
                    style={{ flex:1, padding:'10px 14px' }} />
                  <button onClick={sendToAI} className="btn-primary" style={{ padding:'0 16px', height:44, display:'flex', alignItems:'center' }}>
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── STAFF ── */}
          {tab === 'staff' && (
            <div style={{ animation:'fadeUp .3s ease' }}>
              <h2 style={{ fontWeight:800, fontSize:'1.4rem', color:'#1a1a1a', marginBottom:16 }}>Staff Management</h2>

              {/* Change receptionist PIN */}
              <div className="card" style={{ marginBottom:14 }}>
                <p style={{ fontWeight:700, color:'#1a1a1a', marginBottom:4, fontSize:'0.95rem' }}>🔐 Change Receptionist PIN</p>
                <p style={{ color:'#9ca3af', fontSize:'0.78rem', marginBottom:14 }}>Current PIN is used by receptionist to log in at counter</p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <input className="inp" type="password" maxLength={4} placeholder="New 4-digit PIN" value={newPin}
                    onChange={e=>setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))} />
                  <input className="inp" type="password" maxLength={4} placeholder="Confirm PIN" value={confirmPin}
                    onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))} />
                  {newPin.length===4 && confirmPin.length===4 && newPin!==confirmPin && (
                    <p style={{ color:'#ef4444', fontSize:'0.78rem' }}>PINs don't match</p>
                  )}
                  <button
                    onClick={async()=>{
                      if(newPin.length!==4||newPin!==confirmPin)return
                      // Store in owner_settings table
                      await supabase.from('owner_settings').upsert({ id:1, receptionist_pin: newPin })
                      setPinSaved(true); setNewPin(''); setConfirmPin('')
                      setTimeout(()=>setPinSaved(false),3000)
                    }}
                    className="btn-primary"
                    disabled={newPin.length!==4||newPin!==confirmPin}
                    style={{ opacity:newPin.length===4&&newPin===confirmPin?1:0.5 }}>
                    Save New PIN
                  </button>
                  {pinSaved && <p style={{ color:'#22c55e', fontWeight:600, fontSize:'0.82rem' }}>✅ PIN saved! Staff portal uses it on the next login.</p>}
                </div>
                <div style={{ background:'#fff7ed', borderRadius:10, padding:'10px 12px', marginTop:12 }}>
                  <p style={{ color:'#c2410c', fontSize:'0.75rem', fontWeight:600 }}>⚠️ Staff at /worker read this PIN from the database. If nothing is saved yet, the default is 1234.</p>
                </div>
              </div>

              {/* Order history by staff */}
              <div className="card">
                <p style={{ fontWeight:700, color:'#1a1a1a', marginBottom:4, fontSize:'0.95rem' }}>📋 Today's Order Activity</p>
                <p style={{ color:'#9ca3af', fontSize:'0.78rem', marginBottom:14 }}>Summary of what was processed today</p>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
                  {[
                    { label:'Orders Received', value:todayOrders.length, icon:'📥' },
                    { label:'Collected', value:todayOrders.filter(o=>o.status==='completed').length, icon:'✅' },
                    { label:'Still Pending', value:activeNow.length, icon:'⏳' },
                    { label:'UPI Orders', value:todayOrders.filter(o=>o.payment_method==='upi').length, icon:'📱' },
                  ].map((s,i) => (
                    <div key={i} style={{ background:'#f9fafb', borderRadius:14, padding:'14px 12px' }}>
                      <p style={{ fontSize:'1.2rem', marginBottom:4 }}>{s.icon}</p>
                      <p style={{ fontWeight:800, fontSize:'1.3rem', color:'#1a1a1a' }}>{s.value}</p>
                      <p style={{ color:'#9ca3af', fontSize:'0.72rem', marginTop:2 }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM NAV — mobile */}
      <div className="bottom-nav" style={{ position:'fixed', bottom:0, left:0, right:0, background:'white', borderTop:'1px solid #f0ede8', display:'flex', zIndex:40 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ flex:1, padding:'8px 2px', border:'none', background:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:2, color:tab===t.id?'#f97316':'#9ca3af' }}>
            <t.icon size={18} />
            <span style={{ fontSize:'0.58rem', fontWeight:600 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}