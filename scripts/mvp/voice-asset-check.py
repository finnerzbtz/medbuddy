"""Decode every shipped recording and check the recorded asset manifest."""
import array
import hashlib
import json
import math
import subprocess
from pathlib import Path

manifest = json.loads(Path('rebuild/generated/voice/manifest.json').read_text())
assert len(manifest) == 108, 'The pack must include three previews and every thought in three voices'
checks = []
hashes = set()
for clip, asset in manifest.items():
    file = Path('public') / asset['url'].lstrip('/')
    data = file.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    assert len(data) == asset['bytes'] and digest == asset['sha256'], clip + ': hash/size mismatch'
    assert digest not in hashes, clip + ': duplicate recording'
    hashes.add(digest)
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=sample_rate,channels', '-of', 'json', str(file)], capture_output=True, text=True, check=True)
    stream = json.loads(probe.stdout)['streams'][0]
    assert stream['sample_rate'] == '32000' and stream['channels'] == 1, clip + ': encoding mismatch'
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(file), '-f', 'f32le', '-ac', '1', '-ar', '32000', '-'], capture_output=True, check=True)
    samples = array.array('f')
    samples.frombytes(result.stdout)
    duration = len(samples) / 32000
    peak = max(abs(v) for v in samples)
    rms = math.sqrt(sum(v * v for v in samples) / len(samples))
    assert 0.5 < duration < 25 and 0.005 < rms < 0.25 and peak < 0.8, clip + ': level or duration out of bounds'
    checks.append(dict(clip=clip, duration=round(duration, 3), peak=round(peak, 5), rms=round(rms, 5)))
result = dict(status='passed', clips=len(checks), bytes=sum(a['bytes'] for a in manifest.values()), monoSampleRate=32000, uniqueRecordings=len(hashes), maximumPeak=max(c['peak'] for c in checks), models=sorted(set(a['model'] for a in manifest.values())), checks=checks)
out = Path('rebuild/generated/qa-voice/asset-results.json')
out.write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k:v for k,v in result.items() if k != 'checks'}))
