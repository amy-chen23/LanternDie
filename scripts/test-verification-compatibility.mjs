// Re-run existing rollback-based access suites with the new foundation injected.
// Local high-port disposable PostgreSQL only; never a hosted database command.
import { readFile, writeFile, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const port=process.env.VERIFICATION_TEST_PORT ?? '55439';
if(!/^\d+$/.test(port)||Number(port)<55000)throw new Error('Use a disposable local PostgreSQL port >=55000');
const directory=await mkdtemp(path.join(tmpdir(),'lanterndie-verification-compat-'));
const migration=path.resolve('supabase/migrations/20261118000000_verification_foundations.sql');
const files=(await readdir('tests')).filter(name=>name.endsWith('-access.sql')).sort();
for(const name of files){
 const source=path.resolve('tests',name);let sql=await readFile(source,'utf8');
 const fullSchema=sql.includes('fixtures/report-schema.sql');
 if(fullSchema && !sql.includes('20261118000000')){
  const includes=[...sql.matchAll(/^\\ir .+$/gm)];
  if(!includes.length)throw new Error(`No fixture include in ${name}`);
  const last=includes.at(-1);const end=last.index+last[0].length;
  sql=sql.slice(0,end)+`\n\\ir ${migration}`+sql.slice(end);
 }
 sql=sql.replace(/^\\ir (.+)$/gm,(_,file)=>`\\ir ${path.resolve(path.dirname(source),file)}`);
 const target=path.join(directory,name);await writeFile(target,sql);
 try{
  execFileSync('psql',['-q','-h','127.0.0.1','-p',port,'-d','postgres','-v','ON_ERROR_STOP=1','-f',target],{stdio:['ignore','pipe','pipe']});
  console.log(`PASS ${name} (${fullSchema ? 'with verification foundation' : 'original minimal legacy schema'})`);
 }catch(error){process.stderr.write(error.stderr ?? '');throw new Error(`FAILED ${name}`);}
}
console.log(`Passed ${files.length} local SQL suites; all fixtures rolled back.`);
