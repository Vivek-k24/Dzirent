import {cookies} from 'next/headers';
import {cache} from 'react';
import {serverClient, currentUser} from './supabase/server';
import {Card,Listing,Studio,StudioCardData,BrowseContext,Query,value,cityLabel} from './types';

export const context = cache(async (): Promise<BrowseContext> => {
  const jar=await cookies();
  const today=new Date(); const last=new Date(today); last.setDate(last.getDate()+3);
  const defaults={city:'Austin, TX',lat:30.2672,lng:-97.7431,start:today.toISOString().slice(0,10),end:last.toISOString().slice(0,10),datesActive:false};
  try {
    const loc=JSON.parse(jar.get('dzirent-location')?.value || '{}');
    if (typeof loc.lat==='number' && typeof loc.lng==='number' && Math.abs(loc.lat)<=90 && Math.abs(loc.lng)<=180 && typeof loc.city==='string') {
      Object.assign(defaults,{city:cityLabel(loc.city),lat:loc.lat,lng:loc.lng});
    }
    const dates=JSON.parse(jar.get('dzirent-dates')?.value || '{}');
    if (/^\d{4}-\d{2}-\d{2}$/.test(dates.start || '') && /^\d{4}-\d{2}-\d{2}$/.test(dates.end || '') && dates.end>=dates.start) {
      Object.assign(defaults,{start:dates.start,end:dates.end,datesActive:true});
    }
  } catch { /* Invalid caller preferences fall back to Austin. */ }
  return defaults;
});
const numberOrNull=(s:string)=>s.trim()!=='' && Number.isFinite(Number(s)) ? Number(s) : null;
export async function browse(ctx:BrowseContext,q:Query={}):Promise<Card[]> {
  const client=await serverClient();
  const {data,error}=await client.rpc('browse_listings',{
    p_lat:ctx.lat,p_lng:ctx.lng,p_limit:30,p_offset:Math.max(0,Number(value(q,'page')) || 0)*30,
    p_radius_miles:numberOrNull(value(q,'radius')),p_query:value(q,'q') || null,
    p_category:value(q,'category') || null,p_item_type:value(q,'item') || null,
    p_garment_type:value(q,'garment') || null,p_size:value(q,'size') || null,
    p_styles:value(q,'style') ? [value(q,'style')] : null,
    p_min_price:numberOrNull(value(q,'min')),p_max_price:value(q,'row')==='under' ? 14.99 : numberOrNull(value(q,'max')),
    p_new_days:value(q,'row')==='new' ? 14 : null,
    p_saved_only:value(q,'saved')==='true',p_saved_studios_only:value(q,'row')==='studios',
    p_sort:value(q,'sort') || 'newest',
    p_start_date:ctx.datesActive ? ctx.start : null,p_end_date:ctx.datesActive ? ctx.end : null,
  });
  if(error) throw new Error('We could not load pieces just now. Please try again.');
  return (data || []) as Card[];
}
export const getListing=cache(async (id:string,lat:number,lng:number):Promise<Listing|null>=>{
  if(!/^[a-f0-9-]{36}$/i.test(id)) return null;
  const client=await serverClient();
  const {data,error}=await client.rpc('get_listing',{p_listing_id:id,p_lat:lat,p_lng:lng});
  if(error) throw new Error('We could not load this piece. Please try again.');
  return (data?.[0] || null) as Listing|null;
});
export async function fit(ctx:BrowseContext):Promise<Card[]> {
  const client=await serverClient();
  const {data,error}=await client.rpc('fit_listings',{p_lat:ctx.lat,p_lng:ctx.lng,p_limit:30,p_offset:0});
  if(error) return [];
  return (data || []) as Card[];
}
export async function savedStudios(ctx:BrowseContext):Promise<StudioCardData[]> {
  const client=await serverClient();
  const {data,error}=await client.rpc('my_saved_studios',{p_lat:ctx.lat,p_lng:ctx.lng,p_limit:30,p_offset:0});
  if(error) throw new Error('We could not load your saved studios. Please try again.');
  return data || [];
}
export async function studio(handle:string,ctx:BrowseContext):Promise<Studio|null> {
  const client=await serverClient();
  const {data,error}=await client.rpc('get_studio',{p_handle:handle,p_lat:ctx.lat,p_lng:ctx.lng});
  if(error) throw new Error('We could not load this studio. Please try again.');
  return data?.[0] || null;
}
export async function isSaved(id:string) {
  const user=await currentUser(); if(!user) return false;
  const client=await serverClient();
  const {data}=await client.from('saved_listings').select('listing_id').eq('user_id',user.id).eq('listing_id',id).maybeSingle();
  return Boolean(data);
}
export function studioCards(cards:Card[]):StudioCardData[] {
  const groups=new Map<string,StudioCardData>();
  cards.forEach(c=>{
    if(!c.studio_handle) return;
    const old=groups.get(c.studio_handle);
    if(old) old.piece_count++;
    else groups.set(c.studio_handle,{studio_handle:c.studio_handle,studio_name:c.studio_name || 'Local studio',city:c.city,cover_photo_path:c.cover_photo_path,distance:c.distance,piece_count:1});
  });
  return [...groups.values()];
}
