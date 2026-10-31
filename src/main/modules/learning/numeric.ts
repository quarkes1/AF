/** Finite decimal arithmetic and an explicit unit table; never eval model expressions. */
const units:Record<string,[string,number]>={'':['dimensionless',0],V:['voltage',0],A:['current',0],'Ω':['resistance',0],ohm:['resistance',0],F:['capacitance',0],H:['inductance',0],s:['time',0],m:['length',0],kg:['mass',0],g:['mass',-3],W:['power',0],J:['energy',0],Hz:['frequency',0],N:['force',0],Pa:['pressure',0],C:['charge',0],rad:['angle',0]}
const aliases:Record<string,string>={'伏特':'V','安培':'A','欧姆':'Ω','秒':'s','米':'m','千克':'kg','克':'g','毫伏':'mV','毫安':'mA','毫秒':'ms'}
const prefixes:Record<string,number>={p:-12,n:-9,'μ':-6,u:-6,m:-3,c:-2,k:3,M:6,G:9}
function unit(raw:string):[string,number]{let key=raw.normalize('NFKC').trim();key=aliases[key]??key;if(units[key])return units[key];const prefix=key[0],base=key.slice(1);if(Object.hasOwn(prefixes,prefix)&&units[base]&&base!=='kg')return[units[base][0],units[base][1]+prefixes[prefix]];return[`literal:${key}`,0]}
function decimal(raw:string,exponent:number){const match=/^([+-]?)(\d{0,16})(?:\.(\d{1,16}))?$/.exec(raw);if(!match||!match[2]&&!match[3])return null;return{coefficient:BigInt((match[1]==='-'?'-':'')+(match[2]||'0')+(match[3]??'')),scale:(match[3]?.length??0)-exponent}}
export function numericEquivalent(expected:{number:string;unit:string},actual:{number:string;unit:string},tolerance:string){
 const [dimension,exponent]=unit(expected.unit),[other,otherExponent]=unit(actual.unit);if(dimension!==other)return false
 const a=decimal(expected.number,exponent),b=decimal(actual.number,otherExponent),t=decimal(tolerance,exponent);if(!a||!b||!t||t.coefficient<0)return false
 const scale=Math.max(0,a.scale,b.scale,t.scale),expand=(v:NonNullable<typeof a>)=>v.coefficient*10n**BigInt(scale-v.scale),difference=expand(a)-expand(b)
 return(difference<0?-difference:difference)<=expand(t)
}

/** Exact finite-decimal arithmetic for a deliberately small expression grammar. */
export function numericEquality(left:string,right:string):boolean|null{
 type Rational={n:bigint;d:bigint}
 const reduce=(n:bigint,d:bigint):Rational=>{if(d===0n)throw new Error('DIVISION_BY_ZERO');if(d<0n){n=-n;d=-d}let a=n<0n?-n:n,b=d;while(b){const r=a%b;a=b;b=r}const result={n:n/(a||1n),d:d/(a||1n)};if(result.n.toString().length>256||result.d.toString().length>256)throw new Error('EXPRESSION_LIMIT');return result}
 const evaluate=(raw:string)=>{
  if(raw.length>100||!/^[+-]?\d+(?:\.\d+)?(?:[+*/-][+-]?\d+(?:\.\d+)?)*$/.test(raw))return null
  const tokens=raw.match(/[+*/-]|\d+(?:\.\d+)?/g)!;let index=0
  const number=()=>{let sign=1n;if(tokens[index]==='-'||tokens[index]==='+')sign=tokens[index++]==='-'?-1n:1n;const value=tokens[index++];if(!value||!/^\d/.test(value))throw new Error('INVALID_EXPRESSION');const [whole,fraction='']=value.split('.');return reduce(sign*BigInt(whole+fraction),10n**BigInt(fraction.length))}
  const term=()=>{let value=number();while(tokens[index]==='*'||tokens[index]==='/'){const op=tokens[index++],rhs=number();value=op==='*'?reduce(value.n*rhs.n,value.d*rhs.d):reduce(value.n*rhs.d,value.d*rhs.n)}return value}
  let value=term();while(index<tokens.length){const op=tokens[index++],rhs=term();value=reduce(value.n*rhs.d+(op==='+'?1n:-1n)*rhs.n*value.d,value.d*rhs.d)}return value
 }
 try{const a=evaluate(left),b=evaluate(right);return a&&b?a.n*b.d===b.n*a.d:null}catch{return null}
}
