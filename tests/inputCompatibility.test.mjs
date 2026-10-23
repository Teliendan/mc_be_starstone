import assert from 'node:assert/strict';
import {summarizeInputTrace} from '../starstone_input_probe_bp/scripts/inputTrace.js';
const trace=samples=>({reason:'complete',initial:{on:false,starOn:false},samples});
const sample=(self,max,on=self>0,complete=true,starOn=on)=>({self,max,on,complete,starOn});
// Synthetic observations test diagnostic interpretation, not native delivery.
const matching=summarizeInputTrace(trace([sample(15,15),sample(7,7),sample(0,0)]));
assert.equal(matching.neighborMatches,3);
assert.equal(matching.observedSourceChanges,2);assert.equal(matching.observedBlueChanges,2);
assert.equal(matching.sourceSelfMismatches,0);
const differences=summarizeInputTrace(trace([
  sample(0,15),sample(15,0),sample(0,0,false,false),sample(15,15,false,false),sample(null,0,false)
]));
assert.equal(differences.nativeLowNeighborHigh,1);assert.equal(differences.nativeHighNeighborLow,1);
assert.equal(differences.unknownComparisons,2);
assert.equal(differences.neighborMatches,1,'positive loaded neighbor remains a known legacy-positive observation');
assert.equal(differences.sourceSelfMismatches,1);
const empty=summarizeInputTrace(trace([]));
assert.equal(empty.equivalent,undefined,'no automatic compatibility verdict from silence');
assert.equal(summarizeInputTrace({...trace([]),reason:'target_unloaded'}).windowComplete,false);
console.log('production input monitor: native/neighbor sample comparison, unknown reads, red/blue changes and no false verdict passed');
