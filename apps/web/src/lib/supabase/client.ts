import { createBrowserClient } from '@supabase/ssr';
import { config } from './config';
import { retryingFetch } from '../retry';
export function browserClient() {
  const {url,key} = config();
  // C1: reads are retried (0.5 s, then 2 s); writes never are.
  return createBrowserClient(url,key,{ global: { fetch: retryingFetch() } });
}
