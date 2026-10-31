import {NextRequest,NextResponse} from 'next/server';
import {serverClient} from '@/lib/supabase/server';
export async function GET(request:NextRequest) {
  const q=(request.nextUrl.searchParams.get('q') || '').trim().slice(0,80);
  if(q.length<2) return NextResponse.json([]);
  const {data,error}=await (await serverClient()).rpc('search_cities',{p_query:q,p_limit:20});
  return NextResponse.json(error ? {error:'City search is temporarily unavailable.'} : data || [],{status:error ? 503 : 200,headers:{'Cache-Control':'private, no-store'}});
}
