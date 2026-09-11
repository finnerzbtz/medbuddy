#!/usr/bin/env python3
"""Create synthetic audio only in the dedicated Reminduh QA simulator's Files.

Usage: python3 scripts/ios/native-music-fixtures.py --simulator
       4482F80F-E6EF-499B-BE0D-07C1F6ACACB2
Then choose On My iPhone > Reminduh Audio QA in the app's native music picker.
Existing differing files are never replaced; no app storage or preferences change.
"""
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import plistlib
import struct
import subprocess
import wave

QA_ID = '4482F80F-E6EF-499B-BE0D-07C1F6ACACB2'
QA_NAME = 'Reminduh Notification Onboarding QA'
FOLDER = 'Reminduh Audio QA'


def wav_bytes(seconds, frequency):
    rate = 16000
    frames = bytearray()
    for i in range(rate * seconds):
        t = i / rate
        envelope = min(1, t / .1, (seconds - t) / .1)
        value = .08 * envelope * (math.sin(2 * math.pi * frequency * t)
                                 + .35 * math.sin(2 * math.pi * frequency * 1.5 * t))
        frames.extend(struct.pack('<h', round(value * 32767)))
    out = io.BytesIO()
    with wave.open(out, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(frames)
    return out.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--simulator', required=True, help='Explicit dedicated QA simulator UDID')
    args = parser.parse_args()
    if args.simulator != QA_ID:
        parser.error('Only the existing dedicated Reminduh QA simulator is allowed; no default or personal device.')
    listing = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', '-j']))
    devices = [device for group in listing['devices'].values() for device in group]
    device = next((device for device in devices if device['udid'] == QA_ID), None)
    if not device or device['name'] != QA_NAME or device['state'] != 'Booted':
        parser.error('The named dedicated QA simulator must already be booted; this helper never boots or erases devices.')
    data = Path(device['dataPath']).resolve()
    if data.parent.name != QA_ID:
        parser.error('Unexpected simulator data path; refusing to write.')
    roots = []
    for metadata in (data / 'Containers/Shared/AppGroup').glob('*/.com.apple.mobile_container_manager.metadata.plist'):
        try:
            if plistlib.loads(metadata.read_bytes()).get('MCMMetadataIdentifier') == 'group.com.apple.FileProvider.LocalStorage':
                roots.append(metadata.parent / 'File Provider Storage')
        except (OSError, plistlib.InvalidFileException):
            continue
    if len(roots) != 1 or not roots[0].is_dir():
        parser.error('Expected one existing local Files storage container. Open Files once in this QA simulator first.')
    raw_target = roots[0] / FOLDER
    if raw_target.is_symlink():
        parser.error('Linked fixture directory is preserved; refusing to write.')
    target = raw_target.resolve()
    if not target.is_relative_to(data) or target.parent != roots[0].resolve():
        parser.error('Unexpected or linked fixture directory; refusing to write.')
    files = {
        'QA Calm One.wav': wav_bytes(8, 196),
        'QA Calm Two.wav': wav_bytes(14, 220),
        'QA Invalid Audio.wav': b'Reminduh synthetic invalid audio fixture; deliberately not a WAV.\n',
    }
    manifest = {'fixture': 'reminduh-native-audio-qa-v1', 'simulator': QA_ID,
                'files': {name: {'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
                          for name, content in files.items()}}
    files['QA fixture manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    # Validate every existing destination before any writes; never replace unknown content.
    for name, content in files.items():
        destination = target / name
        if destination.is_symlink() or (destination.exists() and destination.read_bytes() != content):
            parser.error('Existing different fixture is preserved: ' + str(destination))
    target.mkdir(exist_ok=True)
    for name, content in files.items():
        destination = target / name
        if not destination.exists():
            with destination.open('xb') as stream:
                stream.write(content)
    print(json.dumps({'folder': str(target), **manifest}, indent=2))


if __name__ == '__main__':
    main()
