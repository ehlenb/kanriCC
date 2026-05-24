import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  console.warn(
    "[Kanri] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n" +
      "Copy .env.example to .env and fill in your Supabase project credentials.",
  );
}

export const supabase = createClient<Database>(
  url ?? "https://placeholder.supabase.co",
  key ?? "placeholder",
);
