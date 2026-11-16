"""Build the committed ES module with official pas2js 3.2.0 (or compatible)."""
import os
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
compiler=os.environ.get('PAS2JS','pas2js')
output=root/'dist/pascal-engine.generated.js'
subprocess.run([compiler,'-Jc','-Jirtl.js','-O2','-OoRemoveNotUsedDeclarations-',f'-o{output}',str(root/'pascal/webtiny.lpr')],cwd=root,check=True)
with output.open('a') as f:
    f.write('\n// ES module boundary added by scripts/build_pascal.py\nrtl.run("WebTinyNet");\nexport const PascalTiny = pas.WebTinyNet.TTiny;\n')
print('Built',output)
