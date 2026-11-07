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
      const { error: queuesErr } = await client.rpc("admin_queues");
      if (
        queuesErr?.message !==
        "Sign in with two-step verification to use admin tools"
      ) {
        return NextResponse.rewrite(new URL("/_not-found", request.url), {
          status: 404,
        });
      }
    }
  }

  return response;

}
export const config = {matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|woff2)$).*)']};
