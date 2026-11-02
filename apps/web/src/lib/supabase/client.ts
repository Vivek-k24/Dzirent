import { createBrowserClient } from '@supabase/ssr';
import { config } from './config';
export function browserClient() {
  const {url,key} = config();
  return createBrowserClient(url,key);
}
