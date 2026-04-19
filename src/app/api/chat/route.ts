import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY || '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'

  try {
    const { messages, menuContext, slotContext } = await req.json()

    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user')?.content || ''

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

LANGUAGE RULES — follow strictly, no exceptions:
1. DEFAULT language is ENGLISH. If unsure about language, always use English.
2. NEVER use Hindi unless the user explicitly writes in Hindi Devanagari script (हिंदी) or says "Hindi mein batao".
3. The user's last message is: "${lastUserMsg}"
4. Detect the language of this message:
   - If it contains English words → reply in English
   - If it contains Gujarati words in Roman script (avak, ketlu, kem cho, aavak, thai, mahino, orders) → reply in Gujarati script (ગુજરાતી)
   - If it contains Hindi Devanagari (हिंदी) → reply in Hindi
   - If it contains Tamil, Telugu, Kannada etc → reply in that language
   - If mixed or unclear → reply in English
5. STRICTLY: English input = English output. Do NOT switch to Hindi for English messages.

When recommending food items, ALWAYS end your response with a JSON block (no markdown, exact format):
ITEMS_JSON:[{"name":"Samosa","price":20},{"name":"Lime Juice","price":30}]

If no items recommended, end with ITEMS_JSON:[]
Before the JSON, give a friendly short answer with emojis.`,
          },
          {
            role: 'assistant',
            content: 'Hello! I am your CaféQ business assistant. Ask me anything in English, Gujarati, Hindi, or any Indian language!'
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