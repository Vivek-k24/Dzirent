"use client";
import {useId,useState,type ReactNode} from 'react';
export function Tabs({labels,children,initial=0}:{labels:string[];children:ReactNode[];initial?:number}) {
  const [selected,setSelected]=useState(initial);const id=useId();
  return <div><div className="tabs" role="tablist">{labels.map((label,i)=><button key={label} role="tab" aria-selected={selected===i} aria-controls={id+'-panel-'+i} id={id+'-tab-'+i} tabIndex={selected===i ? 0 : -1} onClick={()=>setSelected(i)} onKeyDown={e=>{if(e.key==='ArrowLeft' || e.key==='ArrowRight'){e.preventDefault();const next=(selected+(e.key==='ArrowRight'?1:-1)+labels.length)%labels.length;setSelected(next);document.getElementById(id+'-tab-'+next)?.focus();}}}>{label}</button>)}</div>{children.map((child,i)=><div key={labels[i]} role="tabpanel" id={id+'-panel-'+i} aria-labelledby={id+'-tab-'+i} hidden={selected!==i}>{child}</div>)}</div>;
}
