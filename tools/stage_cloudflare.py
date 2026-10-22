"""Stage regular deployment files outside sync placeholders; optionally deploy."""
import argparse,hashlib,json,subprocess,tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deploy',action='store_true',help='Run a dry-run and then publish the staged production build')
    args=parser.parse_args()
    output=ROOT/'.cloudflare/output'
    if not (output/'v0/config.json').is_file():raise SystemExit('Run pnpm run build:cloudflare first.')
    stage=Path(tempfile.mkdtemp(prefix='perigee-deploy-'))
    records=[]
    for relative in ['cloudflare.config.ts','package.json']:
        (stage/relative).write_bytes((ROOT/relative).read_bytes())
    for source in output.rglob('*'):
        if source.is_file():
            relative=source.relative_to(ROOT);destination=stage/relative
            destination.parent.mkdir(parents=True,exist_ok=True)
            data=source.read_bytes();destination.write_bytes(data)
            digest=hashlib.sha256(data).hexdigest()
            assert hashlib.sha256(destination.read_bytes()).hexdigest()==digest
            records.append({'path':relative.as_posix(),'sha256':digest})
    record={'stage':str(stage),'files':records,'production_deploy_requested':args.deploy}
    evidence=ROOT/'evidence/earth-upgrade';evidence.mkdir(parents=True,exist_ok=True)
    (evidence/'deployment-staging.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
    print('Staged portable build:',stage,flush=True)
    if args.deploy:
        executable=ROOT/'node_modules/.bin'/('cf.cmd' if __import__('os').name=='nt' else 'cf')
        command=[str(executable),'deploy','--prebuilt','--mode','production']
        subprocess.run(command+['--dry-run'],cwd=stage,check=True)
        subprocess.run(command,cwd=stage,check=True)
if __name__=='__main__':main()
