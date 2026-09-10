"""Edit the approved lo-fi recording into a measured, beat-aligned loop. Requires NumPy and ffmpeg."""
from pathlib import Path
import hashlib, json, os, re, subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
REVISION = 'lofi-room-drumless-v2'
DIR = ROOT / 'rebuild/generated/audio' / REVISION
FFMPEG = os.environ.get('FFMPEG', '/opt/homebrew/bin/ffmpeg')
RAW = DIR / 'original.mp3'
SR, HOP, N = 16000, 320, 2048
BPM, BARS = 75, 32
FADE = 4 * 60 / BPM
DURATION = BARS * 4 * 60 / BPM
PREROLL = 0.5

def run(args):
    return subprocess.run([FFMPEG, '-hide_banner', '-y', *map(str,args)], check=True, capture_output=True)

def decode(file, rate, channels):
    return np.frombuffer(run(['-v','error','-i',file,'-ar',rate,'-ac',channels,'-f','f32le','pipe:1']).stdout, np.float32).reshape(-1,channels)

mono = decode(RAW, SR, 1)[:,0]
frames = np.lib.stride_tricks.sliding_window_view(mono,N)[::HOP]
power = np.abs(np.fft.rfft(frames*np.hanning(N),axis=1)) ** 2
freq = np.fft.rfftfreq(N,1/SR)
chroma = np.zeros((len(power),12))
for k in np.where((freq>=65)&(freq<2200))[0]:
    note = int(round(69+12*np.log2(freq[k]/440))) % 12
    chroma[:,note] += power[:,k]
chroma = np.sqrt(chroma)
chroma /= np.linalg.norm(chroma,axis=1)[:,None]+1e-10
energy = np.sqrt(np.mean(frames**2,axis=1))
# Compare the same bar in two complete 32-bar cycles. Avoid the generated beginning and ending.
span = round(FADE*SR/HOP)
period = round(DURATION*SR/HOP)
candidates = []
for a in range(round(3*SR/HOP), min(round(20*SR/HOP),len(chroma)-period-span)):
    b=a+period
    harmony = float(np.mean(np.sum(chroma[a:a+span]*chroma[b:b+span],axis=1)))
    level_gap = abs(float(20*np.log10((energy[a:a+span].mean()+1e-10)/(energy[b:b+span].mean()+1e-10))))
    candidates.append((harmony-level_gap*.035,a,harmony,level_gap))
score,a,harmony,level_gap=max(candidates)
start=a*HOP/SR
stereo=decode(RAW,44100,2)
count=round(DURATION*44100); overlap=round(FADE*44100); first=round(start*44100)
segment=stereo[first:first+count+overlap].copy()
assert len(segment)==count+overlap
loop=segment[overlap:].copy()
u=np.arange(overlap,dtype=np.float64)/overlap*np.pi/2
loop[-overlap:]=segment[count:]*np.cos(u)[:,None]+segment[:overlap]*np.sin(u)[:,None]
# Wrapped handles put the actual loop points away from MP3's encoder/decoder boundary.
handle=round(PREROLL*44100)
padded=np.concatenate([loop[-handle:],loop,loop[:handle]]).astype(np.float32)
pcm=DIR/'loop-padded.f32'; padded.tofile(pcm)
base=['-f','f32le','-ar','44100','-ac','2','-i',pcm]
tone='highpass=f=38,lowpass=f=8200'
measure=run([*base,'-af',tone+',loudnorm=I=-23:TP=-4:LRA=9:print_format=json','-f','null','-']).stderr.decode()
stats=json.loads(re.findall(r'\{\s*"input_i".*?\}',measure,re.S)[-1])
normalize=f"loudnorm=I=-23:TP=-4:LRA=9:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
manifest_path=ROOT/'rebuild/generated/audio/manifest.json'
manifest=json.loads(manifest_path.read_text())
old_target=ROOT/'public'/manifest['zen-music']['url'].split('?')[0].lstrip('/')
temporary=DIR/'mastered.mp3'
run([*base,'-af',tone+','+normalize,'-ar','44100','-ac','2','-codec:a','libmp3lame','-b:a','128k',temporary])
# Inspect the encoded result, including the loop boundary that Web Audio will actually use.
encoded=decode(temporary,44100,2)
i=handle;j=i+count
seam_jump=float(np.max(np.abs(encoded[j-1]-encoded[i])))
ordinary_jump=float(np.quantile(np.abs(np.diff(encoded[i:j],axis=0)),.999))
assert seam_jump < max(.003,ordinary_jump*1.25), (seam_jump,ordinary_jump)
windows=encoded[i:j,0][:count//44100*44100].reshape(-1,44100)
levels=20*np.log10(np.sqrt(np.mean(windows**2,axis=1))+1e-10)
assert levels.min()>-42, 'Unexpected quiet hole in the music loop'
# Keep the rejected source and master for comparison; install only after checks pass.
previous=DIR/'previous-zen-master.mp3'
if not previous.exists() and old_target.exists(): previous.write_bytes(old_target.read_bytes())
sha=hashlib.sha256(temporary.read_bytes()).hexdigest()
target=ROOT/'public/audio'/('soft-afternoon-'+sha[:12]+'.mp3')
target.write_bytes(temporary.read_bytes())
if old_target != target and old_target.exists(): old_target.unlink()
request=json.loads((DIR/'request.json').read_text())
manifest_path=ROOT/'rebuild/generated/audio/manifest.json';manifest=json.loads(manifest_path.read_text())
manifest['zen-music']={'url':'/audio/'+target.name,'provider':'ElevenLabs','model':'music_v2','revision':REVISION,'arrangement':'drumless','title':'Soft afternoon','prompt':request['prompt'],'generatedAt':request['completedAt'],'duration':len(encoded)/44100,'loopStart':PREROLL,'loopEnd':PREROLL+DURATION,'loopDuration':DURATION,'bpm':BPM,'bytes':target.stat().st_size,'sha256':sha,'source':str(RAW.relative_to(ROOT))}
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
urls={key:entry['url'] for key,entry in manifest.items()}
(ROOT/'src/generated/audio.ts').write_text('// Generated audio asset URLs. Credentials never enter this file.\nexport const AUDIO_ASSETS: Record<string, string> = '+json.dumps(urls,indent=2)+';\n')
meta={'title':'Soft afternoon','bpm':BPM,'loopStart':PREROLL,'loopEnd':PREROLL+DURATION}
(ROOT/'src/generated/music-loop.ts').write_text('// Edited loop points; retain the encoded pre/post-roll for seamless decoding.\nexport const MUSIC_LOOP = '+json.dumps(meta,indent=2)+' as const;\n')
report={'revision':REVISION,'arrangement':'drumless','sourceStart':start,'musicalBars':BARS,'bpm':BPM,'loopSeconds':DURATION,'crossfadeSeconds':FADE,'prerollSeconds':PREROLL,'harmonicSimilarity':harmony,'matchedBarLevelDifferenceDb':level_gap,'encodedSeamJump':seam_jump,'ordinary99_9PercentSampleJump':ordinary_jump,'minimum1sRmsDb':float(levels.min()),'maximum1sRmsDb':float(levels.max()),'loudnessAnalysis':stats,'assetBytes':target.stat().st_size,'sha256':sha}
(DIR/'master-report.json').write_text(json.dumps(report,indent=2)+'\n')
# Small review file crosses the real loop join, including music either side.
preview=np.concatenate([encoded[j-12*44100:j],encoded[i:i+12*44100]]).astype(np.float32)
seam=DIR/'loop-review.f32';preview.tofile(seam)
run(['-f','f32le','-ar','44100','-ac','2','-i',seam,'-codec:a','libmp3lame','-b:a','128k',DIR/'loop-review.mp3'])
pcm.unlink();seam.unlink()
print(json.dumps(report,indent=2))
