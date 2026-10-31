"use client";
import {Icon} from '@/components/icon';
export default function ErrorPage({reset}:{reset:()=>void}){
  return <section className="empty-state error-page"><Icon name="hanger"/><h1>A little pause.</h1><p>We couldn?t load this page just now. Your next good find can wait a moment.</p><button className="button" onClick={reset}>Try again <Icon name="arrow"/></button></section>;
}
