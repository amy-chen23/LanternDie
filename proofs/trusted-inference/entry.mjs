import metadata from '../../assets/models/model.json' with {type:'json'};
import { createClassifier } from './runtime.mjs';
import { createInferenceService } from './service.mjs';
import { createSupabaseStore } from './store.mjs';
import { createHandler, proofConfiguration } from './handler.mjs';
const classifier=createClassifier({modelPath:new URL('./private/lanternfly-dead.onnx',import.meta.url),metadata});
let service,allowlist;
export default createHandler({
  getConfig:()=>proofConfiguration(process.env),
  createStore:config=>createSupabaseStore(config),
  infer:(input,token,store,signal,config)=>{
    const key=[...config.allowedUserIds].sort().join(',');
    if(!service||key!==allowlist){service=createInferenceService({metadata,classifier,allowedUserIds:config.allowedUserIds});allowlist=key;}
    return service(input,token,store,signal);
  },
});
