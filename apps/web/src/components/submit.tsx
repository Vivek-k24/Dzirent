"use client";
import {useFormStatus} from 'react-dom';
import {Icon} from './icon';
export function Submit({label}:{label:string}){const {pending}=useFormStatus();return <button className="button full" disabled={pending}>{pending?'Just a moment?':label}<Icon name="arrow"/></button>;}

export function ConfirmSubmit({label,message}:{label:string;message:string}){
  const {pending}=useFormStatus();
  return <button className="button secondary" disabled={pending} onClick={e=>{if(!window.confirm(message))e.preventDefault();}}>{pending?'Just a moment?':label}</button>;
}
