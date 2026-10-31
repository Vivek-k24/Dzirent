import Link from 'next/link';
import {notFound} from 'next/navigation';
import {currentUser} from '@/lib/supabase/server';
import {Gate} from '@/components/cards';
import {Icon} from '@/components/icon';
const features:Record<string,{title:string;copy:string;icon:string}>={
  messages:{title:'Keep the conversation going.',copy:'Message studios, arrange pickup, and make plans for your next piece in the Dzirent app.',icon:'message'},
  'list-a-piece':{title:'Give a good piece another outing.',copy:'Add photos, garment measurements, and availability. Your studio starts with a piece you love.',icon:'hanger'},
  closet:{title:'A little room for possibility.',copy:'Manage your pieces, availability, and rentals in your Dzirent closet in the app.',icon:'closet'},
  settings:{title:'Make it personal.',copy:'Manage your profile and private measurements in the Dzirent app. Your measurements help find pieces likely to fit you.',icon:'user'},
};
export default async function Feature({params}:{params:Promise<{feature:string}>}){
  const {feature}=await params;const data=features[feature];if(!data)notFound();
  if(!await currentUser())return <Gate reason={feature==='messages'?'start a conversation':feature==='list-a-piece'?'list your first piece':'make it personal'} next={'/app/'+feature}/>;
  return <div className="app-panel"><span className="app-icon"><Icon name={data.icon}/></span><span className="eyebrow">AVAILABLE IN THE APP</span><h1>{data.title}</h1><p>{data.copy}</p><p className="muted">Continue in the Dzirent app on your phone.</p><Link className="button" href="/">Keep exploring <Icon name="arrow"/></Link></div>;
}
