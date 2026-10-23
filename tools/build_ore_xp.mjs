// Native Bedrock XP orbs. Rebuild: node tools/build_ore_xp.mjs
// Bedrock stores an Int named "experience value", not Java's Short "Value".
// Sources and native acceptance limits: docs/VANILLA_PARITY.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const T = {byte:1,short:2,int:3,long:4,float:5,string:8,list:9,compound:10};
const tag = (type, value, of) => ({type,value,of});
const int = value => tag(T.int,value), str = value => tag(T.string,value);
const float = value => tag(T.float,value), compound = value => tag(T.compound,value);
const list = (of,value) => tag(T.list,value,of);
function encode(root) {
  const parts = [];
  const number = (bytes, method, value) => {const b=Buffer.alloc(bytes);b[method](value);parts.push(b);};
  const string = value => {const b=Buffer.from(value,'utf8');number(2,'writeUInt16LE',b.length);parts.push(b);};
  const payload = t => {
    if(t.type===T.byte) number(1,'writeInt8',t.value);
    else if(t.type===T.short) number(2,'writeInt16LE',t.value);
    else if(t.type===T.int) number(4,'writeInt32LE',t.value);
    else if(t.type===T.long) number(8,'writeBigInt64LE',t.value);
    else if(t.type===T.float) number(4,'writeFloatLE',t.value);
    else if(t.type===T.string) string(t.value);
    else if(t.type===T.list) {number(1,'writeUInt8',t.of);number(4,'writeInt32LE',t.value.length);t.value.forEach(payload);}
    else if(t.type===T.compound) {
      for(const [name,value] of Object.entries(t.value)) {number(1,'writeUInt8',value.type);string(name);payload(value);}
      number(1,'writeUInt8',0);
    } else throw new Error(`Unsupported NBT tag ${t.type}`);
  };
  number(1,'writeUInt8',T.compound);string('');payload(root);return Buffer.concat(parts);
}
const floats = values => list(T.float,values.map(float));
const ints = values => list(T.int,values.map(int));
const directory = fileURLToPath(new URL('../starstone_bp/structures/starstone/',import.meta.url));
mkdirSync(directory,{recursive:true});
for(let total=1;total<=5;total++) {
  // Native denominations up to five XP: 3 and 1. No fake reward entity.
  const values=total>=3 ? [3,...Array(total-3).fill(1)] : Array(total).fill(1);
  const entities=values.map((value,index)=>compound({
    identifier:str('minecraft:xp_orb'),
    definitions:list(T.string,[str('+minecraft:xp_orb')]),
    Pos:floats([0.4+index*0.1,0.5,0.5]), Motion:floats([0,0,0]), Rotation:floats([0,0]),
    UniqueID:tag(T.long,-(2n**33n)-BigInt(total*10+index)),
    Age:tag(T.short,0), 'experience value':int(value)
  }));
  const root=compound({
    format_version:int(1),size:ints([1,1,1]),structure:compound({
      block_indices:list(T.list,[ints([-1]),ints([-1])]),entities:list(T.compound,entities),
      palette:compound({default:compound({block_palette:list(T.compound,[]),block_position_data:compound({})})})
    }),structure_world_origin:ints([0,0,0])
  });
  writeFileSync(join(directory,`ore_xp_${total}.mcstructure`),encode(root));
}
console.log('Wrote five entity-only native XP templates (1–5 XP).');
