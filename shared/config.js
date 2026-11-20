/* =====================================================================
   MINI GAMES — konfiguracija Supabase
   Publishable (anon) ključ je JAVEN in sme biti v repoju; zaščito
   zagotavljajo RLS pravila v supabase/schema.sql.
   NIKOLI ne vpiši service_role ključa.

   Prazni vrednosti = offline način (vse v localStorage + BroadcastChannel).
   Offline način lahko vsiliš tudi z URL parametrom ?offline=1.
   ===================================================================== */

export const SUPABASE_URL = 'https://ygdjxwchjfvzigasmayg.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_tIyU-rppDYcHt6AxIu9ahA_P1ofVudB';

/** Pripeta verzija knjižnice supabase-js (ESM prek CDN). */
export const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

/** Javni naslov huba (za magic link preusmeritev in QR kode, ko teče lokalno). */
export const SITE_URL = 'https://madli007.github.io/mini-games/';
