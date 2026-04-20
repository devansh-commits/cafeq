import { NextRequest, NextResponse } from 'next/server'

// ── Rate limiter — works per serverless instance ──
// On Vercel each instance is warm for ~5min, this still helps burst attacks
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) { rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 }); return true }
  if (entry.count >= 15) return false
  entry.count++; return true
}

// ── Sanitize text injected into AI prompt ──
function sanitize(str: string): string {
  if (!str) return ''
  // Remove any attempt to break out of the prompt or inject instructions
  return str
    .replace(/\n{3,}/g, '\n\n')  // limit newlines
    .replace(/system:|assistant:|user:/gi, '')  // remove role injection
    .slice(0, 2000)  // hard limit
}

export async function POST(req: NextRequest) {
  // ── Origin check — only allow requests from our own domain ──
  const origin = req.headers.get('origin') || ''
  const host = req.headers.get('host') || ''
  const isLocalDev = host.includes('localhost') || host.includes('192.168.')
  const isVercel = origin.includes('cafeq') || origin.includes('vercel.app')
  if (!isLocalDev && !isVercel && origin !== '') {
    return NextResponse.json({ choices: [{ message: { content: 'Unauthorized' } }], items: [] }, { status: 403 })
  }

  // ── Rate limiting ──
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ choices: [{ message: { content: 'Too many requests. Please wait a minute.' } }], items: [] }, { status: 429 })
  }

  const apiKey = process.env.GROQ_API_KEY || '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'

  try {
    const body = await req.json()
    const { messages, menuContext, slotContext } = body

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ choices: [{ message: { content: 'Invalid request.' } }], items: [] }, { status: 400 })
    }

    // ── Validate message structure ──
    for (const m of messages) {
      if (typeof m?.content !== 'string' || m.content.length > 1000) {
        return NextResponse.json({ choices: [{ message: { content: 'Invalid message format.' } }], items: [] }, { status: 400 })
      }
    }

    const trimmedMessages = messages.slice(-10)
    const lastUserMsg = [...trimmedMessages].reverse().find((m: any) => m.role === 'user')?.content || ''

    // ── Sanitize contexts to prevent prompt injection via menu item names ──
    const safeMenuContext = sanitize(menuContext || '')
    const safeSlotContext = sanitize(slotContext || '')
    const safeLastMsg = sanitize(lastUserMsg)

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `You are CafeQ cafe assistant. Only answer questions about the cafe menu, slots, and orders.
Menu items: ${safeMenuContext}
Slots: ${safeSlotContext}

LANGUAGE RULES:
1. DEFAULT is ENGLISH. If unsure, use English.
2. NEVER use Hindi unless user writes in Hindi Devanagari script.
3. User's last message: "${safeLastMsg}"
4. Match the user's language exactly.

When recommending food items end with:
ITEMS_JSON:[{"name":"Samosa","price":20}]
If no items: ITEMS_JSON:[]
Give a friendly short answer with emojis before the JSON.`,
          },
          { role: 'assistant', content: 'Hello! I am your CaféQ assistant. Ask me anything!' },
          ...trimmedMessages.map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 500) })),
        ],
      }),
    })

    const text = await response.text()
    const data = JSON.parse(text)
    const raw = data.choices?.[0]?.message?.content || 'Sorry, try again!'
    const jsonMatch = raw.match(/ITEMS_JSON:(\[[\s\S]*?\])/)
    let items: unknown[] = []
    let reply = raw
    if (jsonMatch) {
      try { items = JSON.parse(jsonMatch[1]) as unknown[]; reply = raw.replace(/ITEMS_JSON:\[[\s\S]*?\]/, '').trim() }
      catch { items = [] }
    }
    return NextResponse.json({ choices: [{ message: { content: reply } }], items })
  } catch (err) {
    // Don't leak error details in production
    return NextResponse.json({ choices: [{ message: { content: 'Something went wrong. Please try again.' } }], items: [] })
  }
}