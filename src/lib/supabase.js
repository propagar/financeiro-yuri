import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Faltam variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. ' +
    'Crie um arquivo .env na raiz do projeto com esses valores (veja .env.example).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
