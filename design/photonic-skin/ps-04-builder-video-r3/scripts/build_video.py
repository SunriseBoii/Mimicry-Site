"""Balance Video against its peers without changing any other component bytes."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
from scipy.spatial import cKDTree,ConvexHull
ROOT=Path(__file__).resolve().parents[4];D=ROOT/'design/photonic-skin';P=ROOT/'public/photonic-skin';OUT=P/'ps-04-builder-video-r3'
sys.path.insert(0,str(D/'ps-04-m6-1/scripts'))
import build_ps04m61 as author
from m31r_core import camera_basis,presentation_frame
STATE=author.m3.STATE_DTYPE
PATCH=np.dtype([('id','<u2'),('position','<f4',(3,)),('scale','<f2')])
GEOMETRY=np.dtype([('id','<u2'),('position','<f4',(3,)),('normal','<i2',(3,)),('orientation','<i2',(4,))])
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def sha(b):return hashlib.sha256(b).hexdigest()
def write(p,v):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n',encoding='utf-8')

def main():
 layers=[(base,read(P/base/'manifest.json')['states'],dtype,fields) for base,dtype,fields in [
  ('ps-04-final-r1',GEOMETRY,['position','normal','orientation']),('ps-04-final-r2',PATCH,['position','scale']),('ps-04-event-r4',GEOMETRY,['position','normal','orientation'])]]
 camera=np.array([2.8,-7.8,4.6]);right,up,forward=camera_basis(camera.tolist());plane=np.stack([right,up],axis=1);tan=np.tan(np.radians(33)/2)
 states={};proof=[]
 for ns,mf in [('ps-04-m5-5','ps04m55-manifest.json'),('ps-04-m6-1','ps04m61-delta-manifest.json')]:
  for e in read(P/ns/'manifests'/mf)['states']:
   sid=e['stateId']
   if not sid.startswith(('complex-gather-','complex-drive-')) or 'video' not in e['competencyIds']:continue
   raw=(P/ns/e['bufferPath']).read_bytes();assert sha(raw)==e['contentHash'];src=np.frombuffer(raw,STATE).copy()
   for base,manifest,dtype,fields in layers:
    if sid not in manifest:continue
    p=manifest[sid];assert sha(src.tobytes())==p['sourceHash'];data=(P/base/p['patchPath']).read_bytes();assert sha(data)==p['patchHash']
    patch=np.frombuffer(data,dtype)
    for f in fields:src[f][patch['id']]=patch[f]
    assert sha(src.tobytes())==p['resultHash']
   groups={owner:[c['componentIndex'] for c in e['componentMap'] if c['competencyId']==owner] for owner in e['competencyIds']}
   active=src['status']==0;mask=np.isin(src['component'],groups['video']);v=src['position'][active&mask].astype(float);center=(v.min(0)+v.max(0))/2
   def project(points,frame):
    rel=(points+np.array(frame['translate']))*frame['scale']-camera
    return (rel@plane)/((rel@forward)*tan)[:,None]
   def area(points):return float(ConvexHull(points).volume)
   frame=e['presentationFrame'];peerareas=[area(project(src['position'][active&np.isin(src['component'],indices)],frame)) for owner,indices in groups.items() if owner!='video']
   target=float(np.median(peerareas));before_area=area(project(v,frame))
   scale=np.sqrt(target/before_area)
   # Keep the donor rigid. Only uniform scale and translation are allowed.
   enlarged=(v-center)*scale+center
   tree=cKDTree(project(src['position'][active&~mask],frame))
   radius_splat=(float(src['scale'][active&mask].max())*scale+float(src['scale'][active&~mask].max()))*.035*frame['scale']/7/tan
   candidates=[np.zeros(3)]
   for radius in np.arange(.08,6.01,.08):
    candidates.extend(right*(radius*np.cos(a))+up*(radius*np.sin(a)) for a in np.linspace(0,2*np.pi,48,endpoint=False))
   chosen=None
   for offset in candidates:
    proj=project(enlarged+offset,frame)
    gap=float(tree.query(proj)[0].min())-radius_splat
    if gap>=.15:
     chosen=offset;break
   assert chosen is not None,sid
   result=src.copy();result['position'][mask]=(src['position'][mask]-center)*scale+center+chosen;result['scale'][mask]=src['scale'][mask].astype(float)*scale
   # Fit the larger composition, rather than shrinking Video back into its old slot.
   newframe=presentation_frame(result)
   others=project(result['position'][active&~mask],newframe);video=project(result['position'][active&mask],newframe)
   after_area=area(video);peers=[area(project(result['position'][active&np.isin(result['component'],indices)],newframe)) for owner,indices in groups.items() if owner!='video']
   ratio=after_area/float(np.median(peers))
   gap=float(cKDTree(others).query(video)[0].min())-radius_splat*newframe['scale']/frame['scale']
   assert .8<ratio<1.25,(sid,ratio)
   assert gap>.07,(sid,gap)
   assert np.array_equal(src[~mask],result[~mask])
   ids=np.flatnonzero(mask);patch=np.zeros(len(ids),PATCH);patch['id']=ids;patch['position']=result['position'][ids];patch['scale']=result['scale'][ids]
   path=f'patches/{sid}.bin';data=patch.tobytes();(OUT/'patches').mkdir(parents=True,exist_ok=True);(OUT/path).write_bytes(data)
   states[sid]={'sourceHash':sha(src.tobytes()),'resultHash':sha(result.tobytes()),'patchHash':sha(data),'patchPath':path,'recordCount':len(ids),'componentIndices':groups['video'],'presentationFrame':newframe}
   proof.append({'stateId':sid,'scale':float(scale),'offset':chosen.tolist(),'areaRatioBefore':before_area/target,'areaRatioAfter':ratio,'gapNdc':gap,'otherComponentsByteIdentical':True})
   print(sid,round(scale,2),round(ratio,2),round(gap,3),flush=True)
 assert len(states)==126,len(states)
 write(OUT/'manifest.json',{'stage':'PS-04.builder-video-r3','identitySize':16384,'patchRecordStride':16,'states':states})
 write(D/'ps-04-builder-video-r3/reports/geometry-proof.json',{'stateCount':len(states),'rows':proof})
if __name__=='__main__':main()
