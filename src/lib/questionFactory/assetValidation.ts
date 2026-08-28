import { createHash } from "node:crypto";

export const FACTORY_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const FACTORY_ASSET_MAX_DIMENSION = 4096;
export const FACTORY_ASSET_MAX_PIXELS = 16_777_216;

export type ValidatedFactoryAsset = {
  mimeType: "image/svg+xml" | "image/webp";
  extension: "svg" | "webp";
  byteSize: number;
  width: number;
  height: number;
  checksum: string;
};

function dimensions(width:number,height:number):{width:number;height:number}{
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)
    throw new Error("Asset dimensions must be positive integers");
  if(width>FACTORY_ASSET_MAX_DIMENSION||height>FACTORY_ASSET_MAX_DIMENSION||width*height>FACTORY_ASSET_MAX_PIXELS)
    throw new Error("Asset dimensions exceed Factory limits");
  return {width,height};
}

function parseSvg(bytes:Uint8Array):{width:number;height:number}{
  let text:string;
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{throw new Error("SVG is not valid UTF-8");}
  if(!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(text))throw new Error("SVG root element is missing");
  if(/<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b/i.test(text))throw new Error("SVG contains a forbidden active construct");
  if(/\son[a-z]+\s*=/i.test(text))throw new Error("SVG event handlers are forbidden");
  for(const match of text.matchAll(/\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi))
    if(!match[2].startsWith("#"))throw new Error("SVG external or embedded references are forbidden");
  for(const match of text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi))
    if(!match[2].startsWith("#"))throw new Error("SVG external CSS references are forbidden");
  const root=text.match(/<svg\b[^>]*>/i)?.[0]??"";
  const viewBox=root.match(/\bviewBox\s*=\s*["']\s*([-+\d.eE]+)[ ,]+([-+\d.eE]+)[ ,]+([-+\d.eE]+)[ ,]+([-+\d.eE]+)\s*["']/i);
  if(!viewBox)throw new Error("SVG requires a numeric viewBox");
  const width=Number(viewBox[3]),height=Number(viewBox[4]);
  if(!Number.isFinite(width)||!Number.isFinite(height))throw new Error("SVG viewBox is invalid");
  return dimensions(Math.round(width),Math.round(height));
}

function u24(bytes:Uint8Array,offset:number):number{
  return bytes[offset]|(bytes[offset+1]<<8)|(bytes[offset+2]<<16);
}

function parseWebp(bytes:Uint8Array):{width:number;height:number}{
  const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
  if(bytes.length<30||ascii(0,4)!=="RIFF"||ascii(8,12)!=="WEBP")throw new Error("WebP RIFF signature is invalid");
  const declared=bytes[4]|(bytes[5]<<8)|(bytes[6]<<16)|(bytes[7]<<24);
  if(declared+8!==bytes.length)throw new Error("WebP RIFF length does not match bytes");
  const chunk=ascii(12,16);
  if(chunk==="VP8X")return dimensions(u24(bytes,24)+1,u24(bytes,27)+1);
  if(chunk==="VP8L"){
    if(bytes[20]!==0x2f)throw new Error("WebP lossless signature is invalid");
    return dimensions(1+(bytes[21]|((bytes[22]&0x3f)<<8)),1+((bytes[22]>>6)|(bytes[23]<<2)|((bytes[24]&0x0f)<<10)));
  }
  if(chunk==="VP8 "){
    if(bytes[23]!==0x9d||bytes[24]!==0x01||bytes[25]!==0x2a)throw new Error("WebP frame signature is invalid");
    return dimensions((bytes[26]|(bytes[27]<<8))&0x3fff,(bytes[28]|(bytes[29]<<8))&0x3fff);
  }
  throw new Error("Unsupported WebP primary chunk");
}

export function validateFactoryAssetBytes(input:{bytes:Uint8Array;mimeType:string;fileName:string}):ValidatedFactoryAsset{
  if(input.bytes.byteLength<=0)throw new Error("Asset must not be empty");
  if(input.bytes.byteLength>FACTORY_ASSET_MAX_BYTES)throw new Error("Asset exceeds the 5 MiB limit");
  const lower=input.fileName.toLowerCase();
  let parsed:{width:number;height:number},extension:"svg"|"webp";
  if(input.mimeType==="image/svg+xml"&&lower.endsWith(".svg")){parsed=parseSvg(input.bytes);extension="svg";}
  else if(input.mimeType==="image/webp"&&lower.endsWith(".webp")){parsed=parseWebp(input.bytes);extension="webp";}
  else throw new Error("Asset MIME type and filename extension do not match the Factory allowlist");
  return {mimeType:input.mimeType,extension,byteSize:input.bytes.byteLength,...parsed,
    checksum:`sha256:${createHash("sha256").update(input.bytes).digest("hex")}`};
}
