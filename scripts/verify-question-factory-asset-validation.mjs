import { validateFactoryAssetBytes } from "../src/lib/questionFactory/assetValidation.ts";

const bytes=(value)=>new TextEncoder().encode(value);
const valid=bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80"/></svg>');
const result=validateFactoryAssetBytes({bytes:valid,mimeType:"image/svg+xml",fileName:"asset.svg"});
if(result.width!==120||result.height!==80||!result.checksum.startsWith("sha256:"))throw new Error("valid SVG metadata mismatch");

const cases=[
  ["empty",new Uint8Array(),"image/svg+xml","x.svg"],
  ["extension-mismatch",valid,"image/svg+xml","x.webp"],
  ["mime-spoof",valid,"image/webp","x.webp"],
  ["script",bytes('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'),"image/svg+xml","x.svg"],
  ["event-handler",bytes('<svg viewBox="0 0 1 1" onload="x()"></svg>'),"image/svg+xml","x.svg"],
  ["external-href",bytes('<svg viewBox="0 0 1 1"><image href="https://example.com/x"/></svg>'),"image/svg+xml","x.svg"],
  ["doctype",bytes('<!DOCTYPE svg><svg viewBox="0 0 1 1"></svg>'),"image/svg+xml","x.svg"],
  ["missing-viewbox",bytes('<svg width="1" height="1"></svg>'),"image/svg+xml","x.svg"],
  ["oversized-dimensions",bytes('<svg viewBox="0 0 5000 1"></svg>'),"image/svg+xml","x.svg"],
  ["truncated-webp",bytes('RIFFxxxxWEBPVP8X'),"image/webp","x.webp"],
];
for(const [name,data,mimeType,fileName] of cases){
  let rejected=false;try{validateFactoryAssetBytes({bytes:data,mimeType,fileName});}catch{rejected=true;}
  if(!rejected)throw new Error(`${name} unexpectedly passed asset validation`);
}
console.log(JSON.stringify({status:"passed",validSvg:{width:result.width,height:result.height,byteSize:result.byteSize},negativeCases:cases.map(([name])=>name)}));
