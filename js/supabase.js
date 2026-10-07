const SUPABASE_URL = 'https://ikwiqloudbhytibijufd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_x5n-LSTadCKAr_M7PL3m6A_9w31fhy9';

// Initialize the Supabase client
window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);
