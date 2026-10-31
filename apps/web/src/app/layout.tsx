import type {Metadata,Viewport} from 'next';
import {cookies} from 'next/headers';
import {context} from '@/lib/data';
import {currentUser,serverClient} from '@/lib/supabase/server';
import {Shell} from '@/components/shell';
import '@fontsource-variable/roboto';
import './globals.css';
export const metadata:Metadata={
  metadataBase:new URL('https://dzirent.com'),
  icons:{icon:'/logo-mark.svg'},
  title:{default:'Dzirent ? Your neighborhood wardrobe',template:'%s ? Dzirent'},
  description:'Discover pieces for your next occasion from closets close to you. Browse local clothing rentals, find your fit, and get to know neighborhood studios.',
};
export const viewport:Viewport={themeColor:'#ffffff',width:'device-width',initialScale:1};
export default async function RootLayout({children}:{children:React.ReactNode}){
  const [ctx,user,jar]=await Promise.all([context(),currentUser(),cookies()]);
  let name='Your account';
  if(user){const {data}=await (await serverClient()).from('profiles').select('display_name').eq('id',user.id).maybeSingle();name=data?.display_name || 'Your account';}
  return <html lang="en"><body><Shell ctx={ctx} authenticated={Boolean(user)} name={name} showWelcome={!user && !jar.get('dzirent-welcome')}>{children}</Shell></body></html>;
}
