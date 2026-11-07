import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const SERVER_API_KEY=Deno.env.get("GROQ_API_KEY")||"";
const DEFAULT_MODEL=Deno.env.get("COMPANION_MODEL")??"openai/gpt-oss-120b";
const ENCRYPTION_KEY=Deno.env.get("AGENT_CREDENTIALS_ENCRYPTION_KEY")||"";
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const unb64=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
async function encryptionKey(){
 const configured=ENCRYPTION_KEY.trim().replace(/^["']|["']$/g,"");
 if(!configured)throw new Error("Missing credential encryption setting.");
 let raw:Uint8Array|null=null;
 if(/^[a-f0-9]{64}$/i.test(configured))raw=Uint8Array.from(configured.match(/../g)!,x=>parseInt(x,16));
 else if(configured.length===32&&/^[\x20-\x7e]{32}$/.test(configured))raw=new TextEncoder().encode(configured);
 else{
  const encoded=configured.replace(/-/g,"+").replace(/_/g,"/").replace(/\s/g,"");
  if(/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)&&encoded.length%4!==1){try{const decoded=unb64(encoded+"=".repeat((4-encoded.length%4)%4));if(decoded.length===32)raw=decoded}catch{}}
 }
 if(!raw){const bytes=new TextEncoder().encode(configured);if(bytes.length<32)throw new Error("Credential encryption setting is invalid.");raw=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))}
 if(raw.length!==32)throw new Error("Credential encryption setting is invalid.");
 return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["decrypt"]);
}
async function decryptSavedKey(ciphertext:string,iv:string){
 const key=await encryptionKey(),plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(iv)},key,unb64(ciphertext));
 return new TextDecoder().decode(plain);
}
const calls=new Map<string,number[]>();
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const token=(req.headers.get("authorization")??"").replace(/^Bearer\s+/i,"");
 if(!token)return json({error:"Sign in to use Writing Assist."},401);
 const {data:auth,error:authError}=await admin.auth.getUser(token);
 if(authError||!auth.user)return json({error:"Your session expired. Sign in again."},401);
 let apiKey=SERVER_API_KEY,model=DEFAULT_MODEL;
 const {data:saved,error:savedError}=await admin.from("agent_provider_connections").select("api_key_ciphertext,api_key_iv,model,enabled").eq("user_id",auth.user.id).eq("provider","groq").maybeSingle();
 if(savedError&&!apiKey)return json({error:"Could not load your saved Groq connection. Check Bosley Agents and retry."},503);
 if(saved?.enabled){
  try{apiKey=await decryptSavedKey(saved.api_key_ciphertext,saved.api_key_iv);model=saved.model||DEFAULT_MODEL}
  catch(error){console.error("Writing Assist could not decrypt saved provider credentials:",String(error).slice(0,120));return json({error:"Your saved Groq connection needs its credential encryption setting checked. Reconnect Groq in Bosley Agents."},503)}
 }
 if(!apiKey)return json({error:"Connect Groq in Bosley Agents or configure the server GROQ_API_KEY before using Writing Studio."},503);
 const now=Date.now(),recent=(calls.get(auth.user.id)??[]).filter(t=>now-t<60_000);
 if(recent.length>=12)return json({error:"Writing Assist is busy. Try again shortly."},429);
 recent.push(now);calls.set(auth.user.id,recent);
 let body:any;try{body=await req.json()}catch{return json({error:"Invalid writing request."},400)}
 const text=String(body?.text??"").trim().slice(0,6000),mode=String(body?.mode??"polish");
 if(text.length<2)return json({error:"Add some text first."},400);
 const modes:Record<string,string>={polish:"Improve grammar, spelling, punctuation and clarity while preserving meaning, details, names and the author's voice.",grammar:"Correct grammar, spelling and punctuation only. Keep wording and tone close to the original.",clearer:"Make this easier to understand and more naturally structured without changing meaning.",professional:"Rewrite in a clear, respectful professional tone without sounding stiff.",casual:"Make this sound natural and conversational, preserving appropriate slang and Nigerian/West African English.",concise:"Make this more concise. Remove repetition and unnecessary words without losing key meaning.",engaging:"Improve flow, variety and engagement while preserving meaning and voice.",friendly:"Make this warmer and more approachable without becoming overly familiar.",confident:"Make the writing assured and clear without exaggerating or adding claims.",empathetic:"Use considerate, understanding language while preserving the message.",direct:"Make this direct and easy to act on without sounding rude.",persuasive:"Make the argument more compelling using only supplied facts.",simplify:"Use simpler words and shorter sentences while preserving meaning.",expand:"Develop the ideas into fuller, well-structured writing without inventing facts; use placeholders for missing information.",summarize:"Summarize key points accurately and retain important caveats.",formal:"Use formal, polished language while preserving intent.",analyze:"Return valid JSON only with keys score (0-100 integer), tone (short label), summary (one sentence), suggestions (array of up to 8 objects with category, original, replacement, reason). Each original must be an exact substring from the input. Identify sentence-level issues including grammar, punctuation, clarity, run-on sentences, repetition, transitions, readability and consistency. Give concise explanations and context-aware corrections. Preserve Nigerian English and intentional voice. Do not invent corrections or rewrite the entire text.",vocabulary:"Return valid JSON only with keys score (0-100 integer), tone (short label), summary (one sentence), suggestions (array of up to 8 objects with category, original, replacement, reason). Each original must be an exact substring from the input. Suggest context-appropriate vocabulary alternatives for vague, repetitive or weak wording, with a short explanation of nuance. Preserve meaning, audience and the author’s voice. Do not force formal words or alter Nigerian English unnecessarily.",draft_email:"Write a complete, clear email body from supplied notes. Include an appropriate greeting and sign-off. Do not invent facts, dates, promises, attachments or personal details; use square-bracket placeholders for missing information. Return only the email body.",draft_message:"Write a concise, natural message from supplied notes. Preserve intended relationship and tone. Do not invent facts or commitments; use square-bracket placeholders for missing details. Return only the message."};
 const preferences=body?.preferences&&typeof body.preferences==="object"?body.preferences:{};
 const supportedLanguages=["Nigerian English","English (US)","English (UK)","International English","French","Spanish","Portuguese","Arabic","Yoruba","Hausa","Igbo"];
 const requestedLanguage=String(preferences.language||preferences.dialect||"Nigerian English").slice(0,40);
 const outputLanguage=supportedLanguages.includes(requestedLanguage)?requestedLanguage:"Nigerian English";
 const englishStyle=outputLanguage.includes("English")?outputLanguage:"not applicable for this language";
 const preferenceNote="\n\nWriting preferences: goal="+String(preferences.goal||"general").slice(0,40)+"; tone="+String(preferences.tone||"preserve my voice").slice(0,60)+"; audience="+String(preferences.audience||"general reader").slice(0,60)+"; output language="+outputLanguage+"; English style="+englishStyle+". Preserve meaning and do not invent facts.";
 const instruction=modes[mode]??modes.polish;
 const prompt="You are Bosley Writing Assist. "+instruction+preferenceNote+" Write the result in the selected output language. If the selected language differs from the source text, translate or rewrite naturally into that language while preserving all facts, names, intent and tone. When English (US), English (UK), International English or Nigerian English is selected, use that English variety. Preserve Nigerian/West African expressions only when Nigerian English is selected or when the user clearly intends to retain them. Understand informal speech, slang, abbreviations and voice transcription mistakes. Do not invent details. Return only the revised text, with no preamble, quotation marks or explanation.\n\nTEXT:\n"+text;
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),18000);
 try{
  const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",signal:ctl.signal,headers:{"Content-Type":"application/json",Authorization:"Bearer "+apiKey},body:JSON.stringify({model,messages:[{role:"system",content:"You are a careful writing editor. Preserve intent and voice. Never add facts."},{role:"user",content:prompt}],temperature:0.25,max_tokens:1000})});
  if(!response.ok){console.warn("Writing Assist provider response",{status:response.status});return json({error:response.status===429?"Writing Assist is busy. Try again shortly.":response.status===413?"This draft is too long. Shorten it and try again.":"Writing Assist is temporarily unavailable. Your original text is safe."},response.status===429?429:502)}
  const data=await response.json(),revised=String(data?.choices?.[0]?.message?.content??"").trim();
  if(!revised)return json({error:"No revised text was returned. Your original draft is unchanged."},502);
  if(mode==="analyze"||mode==="vocabulary"){
   let analysis:any=null;
   try{const cleaned=revised.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");analysis=JSON.parse(cleaned)}
   catch{return json({error:"The writing review returned an unreadable result. Your original text is safe."},502)}
   const suggestions=Array.isArray(analysis?.suggestions)?analysis.suggestions.filter((item:any)=>item&&typeof item.original==="string"&&typeof item.replacement==="string"&&item.original.length>0&&item.original.length<=500&&item.replacement.length<=700&&text.includes(item.original)).slice(0,8):[];
   return json({analysis:{score:Math.max(0,Math.min(100,Number(analysis?.score)||0)),tone:String(analysis?.tone||"Not assessed").slice(0,80),summary:String(analysis?.summary||"Review complete.").slice(0,260),suggestions},mode,model});
  }
  return json({revised,mode,model});
 }catch(error){return json({error:(error as Error).name==="AbortError"?"Writing Assist took too long. Your original draft is safe.":"Writing Assist could not connect. Your original draft is safe."},504)}
 finally{clearTimeout(timer)}
});