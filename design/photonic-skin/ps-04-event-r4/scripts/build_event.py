"""Restore the common authored Event figure, in the actual deck coordinate frame.

R1 displaced a replacement figure away from its original attachment. R4 samples
the original figure-left mesh (same provider as the other two figures), and
fits its frame using unchanged deck particles. Frozen payloads remain inputs.
"""
from pathlib import Path
import sys, json, hashlib
import numpy as np

ROOT = Path(__file__).resolve().parents[4]
D = ROOT / 'design/photonic-skin'
P = ROOT / 'public/photonic-skin'
OUT = P / 'ps-04-event-r4'
sys.path.insert(0, str(D / 'ps-04-m6-1/scripts'))
import build_ps04m61 as author
sys.path.insert(0, str(D / 'ps-04-final-r1/scripts'))
from build_release_geometry import STATE, PATCH, render_silhouette

def read(p): return json.loads(p.read_text(encoding='utf-8'))
def sha(b): return hashlib.sha256(b).hexdigest()
def write(p,v):
 p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8')

def main():
 library,targets=author.m3.load_sources()
 area=read(D/'ps-03-m3/exports/ps03m3-manifest.json')['masterSurfaceArea']
 r1=read(P/'ps-04-final-r1/manifest.json')['states']
 r2=read(P/'ps-04-final-r2/manifest.json')['states']
 video_dtype=np.dtype([('id','<u2'),('position','<f4',(3,)),('scale','<f2')])
 states={};proof=[]
 for ns,mf in [('ps-04-m5-5','ps04m55-manifest.json'),('ps-04-m6-1','ps04m61-delta-manifest.json')]:
  for e in read(P/ns/'manifests'/mf)['states']:
   sid=e['stateId']
   if sid not in r1: continue
   raw=(P/ns/e['bufferPath']).read_bytes(); assert sha(raw)==e['contentHash']
   src=np.frombuffer(raw,STATE).copy()
   for base,manifest,dtype,fields in [('ps-04-final-r1',r1,PATCH,['position','normal','orientation']),('ps-04-final-r2',r2,video_dtype,['position','scale'])]:
    if sid not in manifest: continue
    p=manifest[sid]; assert sha(src.tobytes())==p['sourceHash']
    data=(P/base/p['patchPath']).read_bytes(); assert sha(data)==p['patchHash']
    patch=np.frombuffer(data,dtype)
    for f in fields: src[f][patch['id']]=patch[f]
    assert sha(src.tobytes())==p['resultHash']
   paths=[D/n/'states/resolved'/f'{sid}.state.json' for n in ['ps-04-m6-1','ps-04-m5-5','ps-03-m3-1']]
   definition=next(read(p) for p in paths if p.exists())
   if 'componentSelections' not in definition:
    definition=read(D/'ps-03-m3-1/states/resolved'/f"{sid.replace('complex-','brand-wide-',1)}.state.json")
   geo=author.m3.build_geometry(definition,targets,float(library['v0']),area)
   original,_=author.m3.build_state_records(geo,16384,area)
   indices={c['componentId']:c['componentIndex'] for c in e['componentMap'] if c['competencyId']=='event'}
   comp=indices['figure-left'];deck=indices['stage-deck']
   match=(src['component']==deck)&(original['component']==deck)&(src['status']==0)&(original['status']==0)
   a=np.column_stack([original['position'][match],np.ones(match.sum())])
   transform=np.linalg.lstsq(a,src['position'][match],rcond=None)[0]
   error=float(np.linalg.norm(a@transform-src['position'][match],axis=1).max())
   assert error<1e-5,(sid,error)
   result=src.copy(); ids=np.flatnonzero(src['component']==comp)
   # Sample ALL active identities; never retain the tail of a smaller donor.
   for status in [0,1,2]:
    selected=ids[src['status'][ids]==status]
    if not len(selected): continue
    selected=selected[np.argsort(src['lodPriority'][selected],kind='stable')]
    samples=author.m3._sample_component(geo.components[comp],len(selected),7919+status*104729)
    pos=samples['position']; normals=samples['normal']@np.linalg.inv(transform[:3]).T
    normals/=np.linalg.norm(normals,axis=1,keepdims=True)
    if status: pos=pos-samples['normal']*.025
    result['position'][selected]=np.column_stack([pos,np.ones(len(pos))])@transform
    result['normal'][selected]=np.rint(normals*32767).astype(np.int16)
    result['orientation'][selected]=np.rint(author.m3._quaternion_from_z(normals)*32767).astype(np.int16)
   before=np.frombuffer(src.tobytes(),'u1').reshape(-1,40);after=np.frombuffer(result.tobytes(),'u1').reshape(-1,40)
   assert np.array_equal(before[:,26:],after[:,26:])
   assert np.array_equal(before[src['component']!=comp],after[src['component']!=comp])
   patch=np.empty(len(ids),PATCH);patch['id']=ids
   for f in ['position','normal','orientation']: patch[f]=result[f][ids]
   path=f'patches/{sid}.bin';data=patch.tobytes()
   (OUT/'patches').mkdir(parents=True,exist_ok=True);(OUT/path).write_bytes(data)
   states[sid]={'sourceHash':sha(src.tobytes()),'resultHash':sha(result.tobytes()),'patchHash':sha(data),'patchPath':path,'recordCount':len(ids),'componentIndex':comp}
   proof.append({'stateId':sid,'deckFitMaxError':error,'activeCount':int(((src['component']==comp)&(src['status']==0)).sum())})
   if sid=='single-event':
    (OUT/'single-event.state.bin').write_bytes(result.tobytes())
    for size in [180,96]: render_silhouette(result,comp,size,D/'ps-04-event-r4/renders'/f'right-{size}.png')
   if len(states)%25==0: print(len(states),flush=True)
 assert len(states)==203
 write(OUT/'manifest.json',{'stage':'PS-04.event-r4','identitySize':16384,'patchRecordStride':28,'states':states})
 write(D/'ps-04-event-r4/reports/geometry-proof.json',{'states':proof,'unchangedMetadata':True,'unchangedOtherComponents':True})
 print('Event R4:',len(states),'states')

if __name__=='__main__': main()
