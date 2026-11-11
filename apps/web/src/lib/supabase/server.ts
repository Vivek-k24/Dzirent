import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { config } from './config';
import { retryingFetch } from '../retry';
export const serverClient = cache(async () => {
  const store = await cookies();
  const {url,key} = config();
  return createServerClient(url,key,{
    // C1: reads are retried (0.5 s, then 2 s); writes never are.
    global: { fetch: retryingFetch() },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (updates) => {
        try { updates.forEach(({name,value,options}) => store.set(name,value,options)); }
        catch { /* Proxy refreshes cookies when Server Components are read-only. */ }
      },
    },
  });
});
export const currentUser = cache(async () => {
  const client = await serverClient();
  const {data: {user}} = await client.auth.getUser();
  return user;
});
