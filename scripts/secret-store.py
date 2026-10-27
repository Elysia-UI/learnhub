"""Private IPC helper; callers must capture stdout, never log it."""
import json, os, sys
from pathlib import Path
profile = Path(os.environ.get('LEARNHUB_CLOUD_PROFILE', str(Path.home() / '.config' / 'learnhub' / 'cloud-profile')))
sys.path.insert(0, str(profile))
sys.path.insert(0, str(profile / 'deps'))
from connect import protect
path = Path(sys.argv[2]).resolve()
if sys.argv[1] == 'read':
    sys.stdout.buffer.write(protect(path.read_bytes(), True))
elif sys.argv[1] == 'write':
    data = sys.stdin.buffer.read()
    json.loads(data)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(protect(data))
else:
    raise SystemExit(2)
