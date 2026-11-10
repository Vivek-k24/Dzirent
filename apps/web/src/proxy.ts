import {createServerClient} from '@supabase/ssr';
import {NextResponse, type NextRequest} from 'next/server';
import {config as supabaseConfig} from '@/lib/supabase/config';
import {ADMIN_CODE_NEEDED} from '@/lib/admin-code';
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
  const {
    data: { user },
  } = await client.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.rewrite(new URL("/_not-found", request.url), {
        status: 404,
      });
    }
    const { data: isAdmin } = await client.rpc("is_admin");
    if (!isAdmin) {
      // An admin without a two-step code in this session, or whose last code is older than
      // 24 hours (P5A), gets the code step on the page they asked for; anyone else gets a 404.
      const { error: queuesErr } = await client.rpc("admin_queues");
      if (!ADMIN_CODE_NEEDED.includes(queuesErr?.message ?? "")) {
        return NextResponse.rewrite(new URL("/_not-found", request.url), {
          status: 404,
        });
      }
    }
  }

  return response;

}
// /.well-known/ (assetlinks.json for Android app links, P5C) is a plain public file: no session work.
export const config = {matcher:['/((?!_next/static|_next/image|favicon.ico|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)']};
