import { NextRequest, NextResponse } from 'next/server'

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'SnappyOrder'

// ── Sanitize text injected into AI prompt ──
function sanitize(str: string): string {
  if (!str) return ''
  return str
    .replace(/\n{3,}/g, '\n\n')
    .replace(/system:|assistant:|user:/gi, '')
    .slice(0, 2000)
}

export async function POST(req: NextRequest) {
  // ── Content-Type check ──
  const contentType = req.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ choices: [{ message: { content: 'Invalid request.' } }], items: [] }, { status: 415 })
  }

  // ── Origin check — only allow requests from our own domain ──
  const origin = req.headers.get('origin') || ''
  const host = req.headers.get('host') || ''
  const isLocalDev = host.includes('localhost') || host.includes('192.168.')
  const isVercel = origin.includes('cafeq') || origin.includes('vercel.app')
  if (!isLocalDev && !isVercel && origin !== '') {
    return NextResponse.json({ choices: [{ message: { content: 'Unauthorized' } }], items: [] }, { status: 403 })
  }

  // ── Rate limiting: handled by Groq's own limits (429 responses forwarded below) ──

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json({ choices: [{ message: { content: 'AI service not configured.' } }], items: [] }, { status: 503 })
  }

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
            content: `You are ${APP_NAME} cafe assistant. Only answer questions about the cafe menu, slots, and orders.
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
          { role: 'assistant', content: `Hello! I am your ${APP_NAME} assistant. Ask me anything!` },
          ...trimmedMessages.map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 500) })),
        ],
      }),
    })

    const text = await response.text()
    if (response.status === 429) {
      return NextResponse.json({ choices: [{ message: { content: 'Too many requests. Please wait a moment and try again.' } }], items: [] }, { status: 429 })
    }
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