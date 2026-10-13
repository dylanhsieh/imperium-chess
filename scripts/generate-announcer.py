#!/usr/bin/env python3
"""Offline macOS voice production. No network calls or audio playback."""
import importlib.util, json, subprocess, tempfile, math, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('local_voices',ROOT/'scripts/generate-voices.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
recipes=[('begin','軍團，前進！','Eddy (Chinese (Taiwan))',195),('check','將軍！保護國王！','Reed (Chinese (Taiwan))',215),('checkmate','將死！勝負已定！','Eddy (Chinese (Taiwan))',190),('draw','和局。整軍，再戰！','Eddy (Chinese (Taiwan))',195),('fear','不要選我！','Meijia (Chinese (Taiwan))',245),('relief','呼！逃過一劫！','Reed (Chinese (Taiwan))',225)]
records=[];audition=[]
with tempfile.TemporaryDirectory(prefix='imperium-voice-') as temp:
 for name,text,voice,speed in recipes:
  aiff=Path(temp)/'voice.aiff';wav=Path(temp)/'voice.wav'
  subprocess.run(['/usr/bin/say','-v',voice,'-r',str(speed),'-o',str(aiff),text],check=True,timeout=40)
  subprocess.run(['/usr/bin/afconvert','-f','WAVE','-d','LEI16@22050','-c','1',str(aiff),str(wav)],check=True,timeout=20)
  values=base.read_pcm(wav);peak=max(map(abs,values));active=[i for i,v in enumerate(values) if abs(v)>max(.003,peak*.025)]
  if not active:raise RuntimeError('Local speech unavailable')
  values=values[max(0,active[0]-220):min(len(values),active[-1]+880)];filtered=[];last=high=low=0
  for i,v in enumerate(values):
   high=.972*(high+v-last);last=v;low+=.72*(high-low);fade=max(0,min(1,i/220,(len(values)-i-1)/880));filtered.append(math.tanh(low*1.3)*fade)
  gain=.82/max(map(abs,filtered));values=[v*gain for v in filtered];out=ROOT/'public/audio'/('commander-'+name+'.wav');base.write_pcm(out,values)
  records.append({'file':out.name,'text':text,'voice':voice,'seconds':round(len(values)/22050,3),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'peak':max(map(abs,values))});audition+=values+[0.0]*8000
  print(name,records[-1]['seconds'],flush=True)
(ROOT/'public/audio/announcer-manifest.json').write_text(json.dumps({'generator':'local macOS say + afconvert + Python PCM processing','networkServices':[],'date':'2026-10-13','clips':records},ensure_ascii=False,indent=2))
base.write_pcm(ROOT/'artifacts/v2-release/announcer-audition.wav',audition)
