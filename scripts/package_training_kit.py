from pathlib import Path
import zipfile
root = Path(__file__).resolve().parents[1]
files = [root/n for n in ['README.md', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.gitignore']]
for folder in ['dist', 'tests', 'training', 'scripts']:
    files.extend(p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc' and p.name != 'training-kit.zip')
with zipfile.ZipFile(root/'dist/training-kit.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        if path.exists(): archive.write(path, 'webtiny-training-kit/'+str(path.relative_to(root)))
print('Built dist/training-kit.zip')
