# Usage: ffmpeg -y -i assets/music.mp3 -ac 1 -ar 22050 /tmp/m.wav && python3 tools/analyze_music.py
import numpy as np, json
from scipy.io import wavfile
from scipy.signal import stft, medfilt
sr,y=wavfile.read('/tmp/m.wav');y=y.astype(np.float32)/32768
dur=len(y)/sr
hop=256;nfft=1024
f,tt,Z=stft(y,sr,nperseg=nfft,noverlap=nfft-hop);S=np.abs(Z)
fps=sr/hop
# onset strength: half-wave rectified log-magnitude flux, weighted toward < 5 kHz
band=f<5000
L=np.log1p(S[band]*50)
flux=np.maximum(0,np.diff(L,axis=1)).sum(0);flux=np.r_[0,flux]
flux=flux-np.convolve(flux,np.ones(int(fps*0.5))/int(fps*0.5),'same')
flux=np.maximum(flux,0);flux/=np.percentile(flux,99)+1e-9
# tempo by autocorrelation (60-200 bpm), weighted around 120-150
ac=np.correlate(flux,flux,'full')[len(flux)-1:]
lags=np.arange(int(fps*60/200),int(fps*60/60))
w=np.exp(-0.5*(np.log2((60*fps/lags)/135))**2)
sc=ac[lags]*w
lag=lags[np.argmax(sc)]
# refine with parabolic interpolation
l0=lag;a,b,c=ac[l0-1],ac[l0],ac[l0+1];off=0.5*(a-c)/(a-2*b+c);period=(l0+off)/fps
bpm=60/period;print('tempo',bpm,'period',period)
# DP beat tracker (Ellis 2007)
P=period*fps;tight=100
n=len(flux);score=flux.copy();back=-np.ones(n,int);cum=flux.copy()
win=np.arange(-int(2*P),-int(P/2))
for i in range(n):
    prev=i+win
    prev=prev[prev>=0]
    if len(prev)==0:continue
    pen=-tight*(np.log((i-prev)/P))**2
    k=np.argmax(cum[prev]+pen)
    cum[i]=flux[i]+cum[prev][k]+pen[k];back[i]=prev[k]
# backtrace from best near end
cand=np.arange(n-int(P),n);i=cand[np.argmax(cum[cand])]
idx=[]
while i>=0:idx.append(i);i=back[i]
idx=idx[::-1];bt=np.array(idx)/fps
# trim leading beats in silence
rm=np.array([np.sqrt(np.mean(y[int(t*sr):int(t*sr)+2048]**2)) if int(t*sr)<len(y)-2048 else 0 for t in bt])
keep=rm>0.02;bt=bt[keep]
# strengths: onset peak within +-50ms, blended with low-band (kick) energy
lowE=np.log1p(S[f<150].sum(0)*10);lowF=np.maximum(0,np.diff(lowE,prepend=lowE[0]));lowF/=np.percentile(lowF,99)+1e-9
st=[]
for t in bt:
    j=int(t*fps);r=slice(max(0,j-6),j+7)
    st.append(0.5*flux[r].max()+0.5*lowF[r].max())
st=np.clip(np.array(st),0,1.5);st=st/np.percentile(st,95);st=np.clip(st,0,1)
print('beats',len(bt),'first',bt[:6].round(3),'ibi mean',np.diff(bt).mean().round(4),'ibi std',np.diff(bt).std().round(4))
# sanity: onset flux at beats vs at points offset by half period
ob=np.mean([flux[int(t*fps)-2:int(t*fps)+3].max() for t in bt]);oh=np.mean([flux[int((t+period/2)*fps)-2:int((t+period/2)*fps)+3].max() for t in bt if (t+period/2)*fps<n-3])
print('mean onset @beats',round(ob,3),'@half-way',round(oh,3))
# intensity envelope 0.5 s
step=0.5;ints=[]
for k in range(int(dur/step)):
    seg=y[int(k*step*sr):int((k+1)*step*sr)];ints.append(float(np.sqrt(np.mean(seg**2))))
ints=np.array(ints);ints=np.clip(ints/np.percentile(ints,95),0,1)
out={'duration':round(dur,3),'bpm':round(bpm,2),'beats':[[round(float(t),3),round(float(s),2)] for t,s in zip(bt,st)],'intensityStep':step,'intensity':[round(float(v),2) for v in ints]}
json.dump(out,open('assets/beatmap.json','w'),separators=(',',':'))
print('first beats',out['beats'][:8]);print('beats 44-48s',[b for b in out['beats'] if 44<b[0]<48])
import os;print(os.path.getsize('assets/beatmap.json'),'bytes')
