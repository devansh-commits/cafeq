import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://xmjlajoznubajqbynomm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhtamxham96bnViYWpxYnlub21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMjM0NDUsImV4cCI6MjA5MDY5OTQ0NX0.W4z6WzF7UR25bcCufn4-xoZoZyz7HL8yL8EoiTJKOE4'
)