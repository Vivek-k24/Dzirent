import {NextRequest,NextResponse} from 'next/server';
import {serverClient} from '@/lib/supabase/server';
import {safeNext} from '@/lib/types';
import {cookies} from 'next/headers';
export async function GET(request:NextRequest) {
  const code=request.nextUrl.searchParams.get('code');
  if(code) {
    const {error}=await (await serverClient()).auth.exchangeCodeForSession(code);
    if(!error) {
      const jar=await cookies();
      const next=safeNext(request.nextUrl.searchParams.get('next') || jar.get('dzirent-auth-next')?.value);
      const response=NextResponse.redirect(new URL(next,request.url));
      response.cookies.set('dzirent-auth-next','',{path:'/',maxAge:0});
      return response;
    }
  }
  return NextResponse.redirect(new URL('/auth?error=The+confirmation+link+has+expired.+Please+sign+in+or+request+another+email.',request.url));
}
