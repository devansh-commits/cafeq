import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xmjlajoznubajqbynomm.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhtamxham96bnViYWpxYnlub21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjM0NDUsImV4cCI6MjA5MDY5OTQ0NX0.W4z6WzF7UR25bcCufn4-xoZoZyz7HL8yL8EoiTJKOE4'

export const supabase = createClient(url, key)