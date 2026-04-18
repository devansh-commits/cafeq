import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('Missing GROQ_API_KEY')
    return NextResponse.json(
      { choices: [{ message: { content: 'Server misconfigured (missing API key).' } }], items: [] },
      { status: 503 }
    )
  }

  try {
    const { messages, menuContext, slotContext } = await req.json()
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `You are CafeQ cafe assistant. 
Menu items available: ${menuContext}
Slots: ${slotContext}

When recommending food items, ALWAYS end your response with a JSON block like this (no markdown, exact format):
ITEMS_JSON:[{"name":"Samosa","price":20},{"name":"Lime Juice","price":30}]

Only include items from the menu. If no items are recommended, end with ITEMS_JSON:[]
Before the JSON, give a friendly short answer with emojis.`,
          },
          ...messages,
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
      try {
        items = JSON.parse(jsonMatch[1]) as unknown[]
        reply = raw.replace(/ITEMS_JSON:\[[\s\S]*?\]/, '').trim()
      } catch {
        items = []
      }
    }

    return NextResponse.json({ choices: [{ message: { content: reply } }], items })
  } catch (err) {
    console.error('ERR:', err)
    return NextResponse.json({ choices: [{ message: { content: 'Error!' } }], items: [] })
  }
}
