const $=(root,selector)=>root.querySelector(selector);
function init(){
 const panel=document.getElementById("money-learning");if(!panel)return;
 const db=()=>window.__bosleySupabaseClient||null;
 const status=(node,message)=>{if(node)node.textContent=message;};
 const addComparison=()=>{
  if(panel.querySelector("#bsc-panel"))return;
  const library=panel.querySelector("#bosley-strategy-library");if(!library)return;
  const box=document.createElement("section");box.id="bsc-panel";box.className="td-card";
  box.innerHTML='<div class="td-head"><h3>Strategy comparison</h3><span class="td-chip">MATCHED DATASET</span></div><p class="bsc-help">Create a comparison set using one saved historical dataset and the same date window. This saves the comparison plan; it does not automatically run backtests.</p><label>Historical dataset<select id="bsc-dataset"><option value="">Choose a saved dataset…</option></select></label><div class="bsc-grid"><label>Start date<input id="bsc-start" type="date"></label><label>End date<input id="bsc-end" type="date"></label></div><div id="bsc-strategies" class="bsc-list">Load your saved strategies to select revisions.</div><div class="bsc-actions"><button type="button" id="bsc-refresh">Refresh options</button><button type="button" id="bsc-create">Save comparison set</button></div><div id="bsc-status" role="status" aria-live="polite">Choose a dataset and at least two strategies.</div><style>#bsc-panel{margin-top:12px}#bsc-panel .bsc-help,#bsc-panel #bsc-status{font-size:11px;opacity:.75;line-height:1.5}#bsc-panel .bsc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:9px}#bsc-panel label{display:block;font-size:11px}#bsc-panel input,#bsc-panel select{width:100%;padding:8px;background:var(--input-bg,rgba(255,255,255,.06));color:inherit;border:1px solid var(--border,rgba(255,255,255,.14));border-radius:8px}#bsc-panel .bsc-list{display:grid;gap:7px;max-height:190px;overflow:auto;margin:10px 0}#bsc-panel .bsc-choice{display:flex;align-items:center;gap:8px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:8px;padding:8px}#bsc-panel .bsc-choice input{width:auto}#bsc-panel .bsc-actions{display:flex;gap:8px;flex-wrap:wrap}#bsc-panel button{font:inherit;border:1px solid var(--border,rgba(255,255,255,.16));border-radius:8px;padding:8px 10px;background:rgba(255,255,255,.07);color:inherit;cursor:pointer}@media(max-width:520px){#bsc-panel .bsc-grid{grid-template-columns:1fr}}</style>';
  library.insertAdjacentElement("afterend",box);
  const say=m=>status($("#bsc-status",box),m);
  const auth=async()=>{const client=db();if(!client)throw Error("Account services are unavailable.");const {data,error}=await client.auth.getUser();if(error||!data?.user)throw Error("Sign in to create a comparison.");return {client,user:data.user};};
  async function refresh(){
   const {client}=await auth();
   const datasets=$("#td-cloud-list");
   const select=$("#bsc-dataset",box);select.replaceChildren(new Option("Choose a saved dataset…",""));
   if(datasets)for(const option of [...datasets.options])if(option.value)select.add(new Option(option.textContent,option.value));
   const {data,error}=await client.from("trading_strategies").select("id,name,current_revision").is("archived_at",null).order("updated_at",{ascending:false}).limit(100);
   if(error)throw error;
   const list=$("#bsc-strategies",box);list.replaceChildren();
   for(const strategy of data||[]){
    const label=document.createElement("label");label.className="bsc-choice";
    const check=document.createElement("input");check.type="checkbox";check.value=strategy.id;
    const text=document.createElement("span");text.textContent=strategy.name+" · latest r"+strategy.current_revision;
    label.append(check,text);list.append(label);
   }
   say((data||[]).length+" strategies available. Select at least two.");
  }
  async function create(){
   const {client,user}=await auth(),datasetId=$("#bsc-dataset",box).value,start=$("#bsc-start",box).value,end=$("#bsc-end",box).value;
   if(!datasetId)throw Error("Choose one saved historical dataset.");
   if(!start||!end||start>end)throw Error("Choose a valid date range.");
   const ids=[...box.querySelectorAll("#bsc-strategies input:checked")].map(x=>x.value);
   if(ids.length<2)throw Error("Select at least two strategies.");
   const {data:dataset,error:datasetError}=await client.from("market_research_datasets").select("id,name,symbol,timeframe,row_count,started_on,ended_on,source_name,source_type,quality_report,metadata").eq("id",datasetId).single();
   if(datasetError)throw datasetError;
   if(!dataset.started_on||!dataset.ended_on||start<dataset.started_on||end>dataset.ended_on)throw Error("Date range must be inside the selected dataset's available history.");
   const {data:strategies,error}=await client.from("trading_strategies").select("id,current_revision").in("id",ids);
   if(error)throw error;
   const revisions=[];
   for(const strategy of strategies||[]){
    const {data:revision,error:revisionError}=await client.from("trading_strategy_revisions").select("id,revision_number").eq("strategy_id",strategy.id).eq("revision_number",strategy.current_revision).single();
    if(revisionError)throw revisionError;
    revisions.push({strategy_id:strategy.id,strategy_revision_id:revision.id,sort_order:revisions.length});
   }
   const {data:comparison,error:createError}=await client.from("trading_strategy_comparisons").insert({
    user_id:user.id,name:"Comparison · "+new Date().toLocaleDateString(),dataset_id:datasetId,
    dataset_snapshot:{id:dataset.id,name:dataset.name,symbol:dataset.symbol,timeframe:dataset.timeframe,row_count:dataset.row_count,source_name:dataset.source_name,source_type:dataset.source_type,quality_report:dataset.quality_report},
    date_start:start,date_end:end,assumptions:{same_dataset:true,same_date_range:true,same_engine_version:true}
   }).select("id").single();
   if(createError)throw createError;
   const {error:itemError}=await client.from("trading_strategy_comparison_items").insert(revisions.map(x=>({...x,comparison_id:comparison.id,user_id:user.id})));
   if(itemError)throw itemError;
   say("Comparison set saved with "+revisions.length+" strategy revisions on "+dataset.name+". Run each backtest with this same dataset and date range to complete the comparison.");
  }
  const safe=fn=>async()=>{try{await fn()}catch(e){say(e?.message||"Operation failed.");}};
  $("#bsc-refresh",box).addEventListener("click",safe(refresh));$("#bsc-create",box).addEventListener("click",safe(create));safe(refresh)();
 };
 const addAudit=()=>{
  if(panel.querySelector("#bsa-panel"))return;
  const library=panel.querySelector("#bosley-strategy-library");if(!library)return;
  const box=document.createElement("section");box.id="bsa-panel";box.className="td-card";
  box.innerHTML='<div class="td-head"><h3>Backtest execution history</h3><span class="td-chip">AUDIT LOG</span></div><p style="font-size:11px;opacity:.72">Backtests started with a saved strategy revision are recorded separately with their dataset snapshot, settings and status events.</p><div id="bsa-status" role="status" aria-live="polite">Save or select a strategy before starting a backtest to attach an execution log.</div><div id="bsa-runs" style="display:grid;gap:7px;max-height:210px;overflow:auto;margin-top:9px"></div><button type="button" id="bsa-refresh" style="margin-top:8px">Refresh execution history</button>';
  box.style.marginTop="12px";library.insertAdjacentElement("afterend",box);
  const say=m=>status($("#bsa-status",box),m),logView=$("#bsa-runs",box);
  let active=null,observer=null;
  async function auth(){const client=db();if(!client)throw Error("Account services are unavailable.");const {data,error}=await client.auth.getUser();if(error||!data?.user)throw Error("Sign in to view execution history.");return {client,user:data.user};}
  async function refresh(){
   const {client}=await auth(),{data,error}=await client.from("trading_backtest_runs").select("id,status,created_at,execution_mode,metrics,error_summary,config,dataset_snapshot").order("created_at",{ascending:false}).limit(20);
   if(error)throw error;logView.replaceChildren();
   for(const run of data||[]){const row=document.createElement("div");row.style.cssText="border:1px solid var(--border,rgba(255,255,255,.12));border-radius:9px;padding:9px;font-size:11px";
    const strong=document.createElement("strong");strong.textContent=run.status.toUpperCase()+" · "+(run.dataset_snapshot?.name||"Dataset not attached");
    const detail=document.createElement("div");detail.textContent=new Date(run.created_at).toLocaleString()+" · "+run.execution_mode+" · "+run.id.slice(0,8);
    const button=document.createElement("button");button.type="button";button.textContent="View log";button.style.marginTop="6px";
    button.addEventListener("click",async()=>{try{const {client}=await auth(),{data,error}=await client.from("trading_backtest_logs").select("sequence_number,level,event,message,created_at").eq("run_id",run.id).order("sequence_number");if(error)throw error;detail.textContent=(data||[]).map(x=>"#"+x.sequence_number+" "+x.level.toUpperCase()+" · "+x.event+": "+x.message).join(" | ")||"No events recorded yet."; }catch(e){say(e.message);}});
    row.append(strong,detail,button);logView.append(row);
   }
   say((data||[]).length+" recent execution records.");
  }
  async function beginRun(){
   if(active)return;
   const selected=$("#bsl-select"),revisionSelect=$("#bsl-revision"),strategyId=selected?.value,ready=(($("#td-report-tag")?.textContent||"").trim());
   if(!["READY","TEST READY"].includes(ready)){say("Understand and validate the strategy before starting an audited backtest.");return;}
   if(!strategyId){say("Save or select a named strategy before running if you want this execution audited.");return;}
   try{
    const {client,user}=await auth();let revisionId=revisionSelect?.value;
    if(!revisionId){const {data,error}=await client.from("trading_strategy_revisions").select("id").eq("strategy_id",strategyId).order("revision_number",{ascending:false}).limit(1).single();if(error)throw error;revisionId=data.id;}
    const datasetId=$("#td-cloud-list")?.value||null,datasetLabel=$("#td-cloud-list")?.selectedOptions?.[0]?.textContent||"Unspecified dataset";
    const config={initial_capital:Number($("#td-capital")?.value||0),allocation_pct:Number($("#td-risk")?.value||0),risk_per_trade_pct:Number($("#td-risk-per-trade")?.value||0),stop_loss_pct:Number($("#td-stop-loss")?.value||0),take_profit_pct:Number($("#td-take-profit")?.value||0)};
    const {data:run,error}=await client.from("trading_backtest_runs").insert({user_id:user.id,strategy_id:strategyId,strategy_revision_id:revisionId,dataset_id:datasetId,dataset_snapshot:{name:datasetLabel,data_mode:document.querySelector("#td-dataset-name")?.textContent||"Current Trading Dock dataset"},execution_mode:"backtest",status:"running",config,initial_capital:config.initial_capital}).select("id").single();
    if(error)throw error;active={id:run.id,client,userId:user.id,seq:0};
    await writeLog("run_started","Backtest execution started.",{dataset:datasetLabel,config});
    const tag=$("#td-report-tag"),runStatus=$("#td-run-status");
    if(observer)observer.disconnect();
    observer=new MutationObserver(()=>{const value=(tag?.textContent||"").trim().toLowerCase();if(["completed","failed","cancelled"].includes(value))finish(value,runStatus?.textContent||"");});
    if(tag)observer.observe(tag,{childList:true,characterData:true,subtree:true});
    say("Execution "+run.id.slice(0,8)+" is being audited.");
   }catch(e){say("Could not create audit record: "+(e?.message||e));}
  }
  async function writeLog(event,message,details={}){
   if(!active)return;const sequence=active.seq++;
   const {error}=await active.client.from("trading_backtest_logs").insert({run_id:active.id,user_id:active.userId,sequence_number:sequence,level:event==="run_failed"?"error":"info",event,message:String(message||"").slice(0,4000),details});
   if(error)throw error;
  }
  async function finish(statusValue,message){
   if(!active)return;const current=active;if(observer)observer.disconnect();
   try{await writeLog("run_"+statusValue,message);const {error}=await current.client.from("trading_backtest_runs").update({status:statusValue==="completed"?"completed":statusValue,completed_at:new Date().toISOString(),error_summary:statusValue==="failed"?message.slice(0,2000):null}).eq("id",current.id);if(error)throw error;active=null;await refresh();say("Execution "+current.id.slice(0,8)+" "+statusValue+" and its log was saved.");}catch(e){active=null;say("Execution finished, but audit update failed: "+e.message);}
  }
  $("#bsa-refresh",box).addEventListener("click",()=>refresh().catch(e=>say(e.message)));
  panel.addEventListener("click",event=>{if(event.target.closest("#td-run"))beginRun();});
  refresh().catch(e=>say(e.message));
 };
 const observer=new MutationObserver(()=>{if(panel.querySelector("#bosley-strategy-library")){addComparison();addAudit();}});
 observer.observe(panel,{childList:true,subtree:true});if(panel.querySelector("#bosley-strategy-library")){addComparison();addAudit();}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();