/**
 * @fileoverview Supabase Cloud Storage & Database Client for Arlo Clipper.
 * Initializes Supabase client with environment fallbacks for offline mock operations.
 * @module lib/supabase
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Credentials missing. Running in mock/local mode.');
}

/**
 * Shared Supabase Client instance.
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
export const supabase = createClient(
  supabaseUrl || 'https://mock.supabase.co',
  supabaseAnonKey || 'mock-key'
);
