import {createServerClient} from '@supabase/ssr';
import {NextResponse, type NextRequest} from 'next/server';
import {config as supabaseConfig} from '@/lib/supabase/config';
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({request});
  const {url,key} = supabaseConfig();
  const client = createServerClient(url,key,{
    cookies:{
      getAll:()=>request.cookies.getAll(),
      setAll(updates) {
        updates.forEach(({name,value})=>request.cookies.set(name,value));
        response=NextResponse.next({request});
        updates.forEach(({name,value,options})=>response.cookies.set(name,value,options));
      }
    }
  });
  await client.auth.getUser();
  return response;
}
export const config = {matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)']};
