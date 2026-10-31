import Link from 'next/link';
import {Card,StudioCardData,price,distance,cityLabel} from '@/lib/types';
import {photoUrl} from '@/lib/supabase/config';
import {Photo} from './photo';
import {Icon} from './icon';
export function PieceCard({card,priority=false}:{card:Card;priority?:boolean}) {
  return <Link className="piece-card" href={'/listing/'+card.id}><div className="piece-image"><Photo src={photoUrl(card.cover_photo_path)} alt={card.title} priority={priority}/></div><h3>{card.title}</h3><p>{price(card.price)} <span aria-hidden="true">?</span> {distance(card.distance)}</p></Link>;
}
export function PieceGrid({cards}:{cards:Card[]}) {
  return cards.length ? <div className="piece-grid">{cards.map(c=><PieceCard key={c.id} card={c}/>)}</div> : <Empty title="Nothing here just yet" text="Try a different date range or a wider search. Your next favorite piece could be close by." href="/search" label="Explore pieces"/>;
}
export function StudioCards({studios,authenticated}:{studios:StudioCardData[];authenticated:boolean}) {
  return studios.length ? <div className="studio-grid">{studios.map(s=><Link key={s.studio_handle} className="studio-card" href={authenticated ? '/studio/'+s.studio_handle : '/auth?mode=signup&reason=studio&next='+encodeURIComponent('/studio/'+s.studio_handle)}><div className="studio-image"><Photo src={photoUrl(s.cover_photo_path)} alt={'Pieces from '+s.studio_name}/><span className="studio-avatar">{s.studio_name.slice(0,1).toUpperCase()}</span></div><h3>{s.studio_name}</h3><p>{cityLabel(s.city)}</p><span className="text-link">Visit studio <Icon name="arrow"/></span></Link>)}</div> : <Empty title="Your studios, together" text="Save a studio you love and find its pieces here next time." href="/?tab=studios" label="Discover studios"/>;
}
export function Empty({title,text,href,label}:{title:string;text:string;href?:string;label?:string}) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="hanger"/></div><h2>{title}</h2><p>{text}</p>{href && <Link className="button" href={href}>{label || 'Browse pieces'} <Icon name="arrow"/></Link>}</div>;
}
export function Gate({reason='make it yours',next='/'}:{reason?:string;next?:string}) {
  return <section className="gate-panel"><div className="eyebrow">A LITTLE MORE PERSONAL</div><Icon name="bookmark" className="gate-icon"/><h1>Sign up to {reason}.</h1><p>Save the pieces you love, get to know local studios, and find a fit that feels like you.</p><div className="button-row"><Link className="button" href={'/auth?mode=signup&next='+encodeURIComponent(next)}>Create an account <Icon name="arrow"/></Link><Link className="button secondary" href={'/auth?mode=signin&next='+encodeURIComponent(next)}>Sign in</Link></div><Link className="muted-link" href="/">Keep browsing</Link></section>;
}
