"""R2: fit the rigid Video donor to its ACTIVE authoring slot, then separate
its projected splats. R1 and frozen payloads are inputs only. Positions and scale
are the only patched fields; IDs, orientations, ownership and LOD remain exact.
"""
from pathlib import Path
import sys, json, hashlib
import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[4]
DESIGN = ROOT / 'design/photonic-skin'
PUBLIC = ROOT / 'public/photonic-skin'
OUT = PUBLIC / 'ps-04-final-r2'
sys.path.insert(0, str(DESIGN / 'ps-04-m6-1/scripts'))
import build_ps04m61 as author
sys.path.insert(0, str(DESIGN / 'ps-04-final-r1/scripts'))
from build_release_geometry import STATE, PATCH as R1PATCH
from m31r_core import camera_basis

PATCH = np.dtype([('id','<u2'),('position','<f4',(3,)),('scale','<f2')])
def read(p): return json.loads(p.read_text(encoding='utf-8'))
def digest(b): return hashlib.sha256(b).hexdigest()
def write(p, value):
 p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def main():
 library, targets = author.m3.load_sources()
 master_area = read(DESIGN/'ps-03-m3/exports/ps03m3-manifest.json')['masterSurfaceArea']
 frozen=read(PUBLIC/'ps-04-m5-5/manifests/ps04m55-manifest.json')
 delta=read(PUBLIC/'ps-04-m6-1/manifests/ps04m61-delta-manifest.json')
 release=read(PUBLIC/'ps-04-final-r1/manifest.json')
 camera=np.array([2.8,-7.8,4.6]);right,up,forward=camera_basis(camera.tolist())
 tan=np.tan(np.radians(33)/2)
 output={}; proof=[]
 for namespace, manifest in [('ps-04-m5-5',frozen),('ps-04-m6-1',delta)]:
  for entry in manifest['states']:
   comps=entry.get('componentMap',[])
   owners={c['competencyId'] for c in comps}
   if 'video' not in owners or len(owners)<2: continue
   # All composite derivatives, including canonical all-seven builder states.
   sid=entry['stateId'];indices=[c['componentIndex'] for c in comps if c['competencyId']=='video']
   raw=(PUBLIC/namespace/entry['bufferPath']).read_bytes()
   assert digest(raw)==entry['contentHash'],sid
   src=np.frombuffer(raw,dtype=STATE).copy()
   r1=release['states'].get(sid)
   if r1:
    patch=(PUBLIC/'ps-04-final-r1'/r1['patchPath']).read_bytes()
    assert digest(patch)==r1['patchHash']
    for row in np.frombuffer(patch,dtype=R1PATCH):
     for field in ['position','normal','orientation']: src[field][row['id']]=row[field]
    assert digest(src.tobytes())==r1['resultHash']
   source_hash=digest(src.tobytes())
   mask=np.isin(src['component'],indices);active=mask&(src['status']==0)
   # Recover the pre-donor active slot, never the reserve sphere used by R1's RMS fit.
   definition_paths=[DESIGN/'ps-04-m6-1/states/resolved'/f'{sid}.state.json',DESIGN/'ps-04-m5-5/states/resolved'/f'{sid}.state.json',DESIGN/'ps-03-m3-1/states/resolved'/f'{sid}.state.json']
   definition=next((read(p) for p in definition_paths if p.exists()),None)
   if definition and 'componentSelections' not in definition:
    canonical=sid.replace('complex-', 'brand-wide-', 1)
    definition=read(DESIGN/'ps-03-m3-1/states/resolved'/f'{canonical}.state.json')
   if definition is None: raise ValueError(f'No reproducible active slot: {sid}')
   geo=author.m3.build_geometry(definition,targets,float(library['v0']),master_area)
   slot,_=author.m3.build_state_records(geo,16384,master_area)
   slotpts=slot['position'][np.isin(slot['component'],indices)&(slot['status']==0)].astype(float)
   donor=src['position'][active].astype(float)
   slot2=slotpts@np.stack([right,up],axis=1); donor2=donor@np.stack([right,up],axis=1)
   ratio=min(np.ptp(slot2,axis=0)/np.maximum(np.ptp(donor2,axis=0),1e-6))*0.90
   ratio=min(ratio,0.90)
   center=(donor.min(0)+donor.max(0))/2
   slotcenter=(slotpts.min(0)+slotpts.max(0))/2
   frame=entry['presentationFrame']; frame_scale=frame['scale'];translate=np.array(frame['translate'])
   def project(points):
    rel=(points+translate)*frame_scale-camera
    return np.stack([rel@right,rel@up],axis=1)/((rel@forward)*tan)[:,None]
   others=(~mask)&(src['status']==0)
   tree=cKDTree(project(src['position'][others]))
   # 0.12 NDC supports 12px at a 200px actor box, 6px at 100px;
   # add the projected radii of both scales to avoid edge contact.
   other_radius=float(src['scale'][others].max())*.035*frame_scale/7/tan
   candidates=[(0.,0.)]
   for radius in np.arange(.10,2.51,.10):
    candidates.extend((float(radius*np.cos(a)),float(radius*np.sin(a))) for a in np.linspace(0,2*np.pi,32,endpoint=False))
   chosen=None
   for shrink in [1.,.9,.8,.7,.6]:
    scale=ratio*shrink
    moved=(donor-center)*scale+slotcenter
    own_radius=float(src['scale'][active].max())*scale*.035*frame_scale/7/tan
    for dx,dy in candidates:
     offset=right*dx+up*dy;proj=project(moved+offset)
     if np.max(np.abs(proj))>.82: continue
     gap=float(tree.query(proj,k=1)[0].min())-own_radius-other_radius
     if gap>=.12:
      chosen=(scale,offset,gap);break
    if chosen:break
   if not chosen: raise ValueError(f'No nonoverlapping Video placement: {sid}')
   scale,offset,gap=chosen
   result=src.copy();result['position'][mask]=(src['position'][mask]-center)*scale+slotcenter+offset
   result['scale'][mask]=src['scale'][mask].astype(float)*scale
   ids=np.flatnonzero(mask);patch=np.zeros(len(ids),dtype=PATCH)
   patch['id']=ids;patch['position']=result['position'][ids];patch['scale']=result['scale'][ids]
   path=f'patches/{sid}.video-r2.bin';payload=patch.tobytes();(OUT/path).parent.mkdir(parents=True,exist_ok=True);(OUT/path).write_bytes(payload)
   output[sid]={'sourceHash':source_hash,'resultHash':digest(result.tobytes()),'patchHash':digest(payload),'patchPath':path,'recordCount':len(ids),'componentIndices':indices}
   proof.append({'stateId':sid,'scale':float(scale),'offset':offset.tolist(),'gapNdc':gap,'activeVideo':int(active.sum()),'slotSource':'active-pre-donor','unchangedOtherBytes':src[~mask].tobytes()==result[~mask].tobytes()})
   print(sid,round(scale,3),round(gap,3),flush=True)
 write(OUT/'manifest.json',{'stage':'PS-04.final-r2','identitySize':16384,'patchRecordStride':16,'parent':'PS-04.final-r1','states':output})
 write(DESIGN/'ps-04-final-r2/reports/geometry-proof.json',{'stateCount':len(output),'projectionCamera':camera.tolist(),'rows':proof})

if __name__=='__main__':main()
