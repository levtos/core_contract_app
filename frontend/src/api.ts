export type UIState = 'loading'|'ready'|'empty'|'stale'|'degraded'|'unavailable'|'reconnecting'|'offline'|'error'|'blocked';
export type Json = null|boolean|number|string|Json[]|{[key:string]:Json};
export interface Revision { revision:number; checksum:string; config:Json }
export interface Draft { draft_id:string; draft_version:number; config:Json }
export interface Service { ready:boolean; publication_confirmed:boolean; persistence:string; ha:string; bridge:string; mqtt:string }
export function serviceState(service:Service):UIState {
  if (!service.publication_confirmed) return 'stale';
  if (!service.ready) return 'blocked';
  if (service.ha !== 'connected' || service.bridge !== 'connected') return 'degraded';
  return 'ready';
}
export async function request<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const response=await fetch(`./api/v1/${path}`,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if (!response.ok) {
    const error=await response.json().catch(()=>({error:'invalid_response'}));
    throw new Error(`Anfrage fehlgeschlagen (${response.status}): ${JSON.stringify(error)}`);
  }
  return await response.json() as T;
}
