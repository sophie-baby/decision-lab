"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Copy, Database, HomeIcon, Laptop, Plus, RotateCcw, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { StatusBanner } from "@/components/ui/status-banner";
import { calculateDecision, normalizeWeightsToHundred, rebalanceWeightRecord } from "@/lib/decision-domain";
import { createLaptopTemplate, createOfferTemplate, createPublicDemoDecision, createRentTemplate } from "@/lib/decision-templates";
import { createDecision, deleteDecision, duplicateDecision, listDecisionSummaries, subscribeDecisionChanges, type DecisionSummary } from "@/lib/decision-repository";

type View = "demo" | "decisions" | "new";
const publicDemo = createPublicDemoDecision();
const demoColors = ["#175cd3", "#e35f45", "#7b61c9"];
const factors = publicDemo.criteria.map(criterion => ({ key: criterion.id, name: criterion.name }));
type DemoRank = ReturnType<typeof calculateDecision>[number] & { color: string };

function rebalanceWeightArray(weights: number[], changedIndex: number, nextWeight: number) {
  const record = Object.fromEntries(weights.map((weight, index) => [String(index), weight]));
  const balanced = rebalanceWeightRecord(record, String(changedIndex), nextWeight);
  return weights.map((_, index) => balanced[String(index)]);
}

export default function HomePage() {
  const router = useRouter();
  const [view, setView] = useState<View>("demo");
  const [weights, setWeights] = useState([35, 30, 20, 15]);
  const [items, setItems] = useState<DecisionSummary[]>([]);
  const [name, setName] = useState("我的方案对比");
  const [message, setMessage] = useState("");
  const [storageError, setStorageError] = useState(false);
  const load = async () => { try { setItems(await listDecisionSummaries()); setStorageError(false); } catch { setStorageError(true); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => subscribeDecisionChanges(() => { void load(); }), []);
  useEffect(() => { if (message !== "已删除") return; const timeout = window.setTimeout(() => setMessage(""), 3000); return () => window.clearTimeout(timeout); }, [message]);

  const ranked = useMemo(() => calculateDecision(publicDemo,Object.fromEntries(factors.map((factor,index)=>[factor.key,weights[index]]))).map(option=>({...option,color:demoColors[option.displayOrder]})), [weights]);
  const createFromInput = async (input: Parameters<typeof createDecision>[0], step: string) => {
    if (!name.trim()) { setMessage("请先输入决策名称"); return; }
    try { const decision = await createDecision(input); router.push(`/decisions/${decision.id}/${step}`); }
    catch { setStorageError(true); setMessage("保存失败，请检查浏览器是否允许本地存储"); }
  };
  const createBlank = async () => {
    if (!name.trim()) { setMessage("请先输入决策名称"); return; }
    const optionIds=[crypto.randomUUID(),crypto.randomUUID()]; const criterionId=crypto.randomUUID();
    await createFromInput({name:name.trim(),source:"blank",options:optionIds.map((id,index)=>({id,name:`方案 ${index+1}`,displayOrder:index})),criteria:[{id:criterionId,name:"核心因素",weight:100,displayOrder:0,type:"objective",direction:"higher",unit:"",preferenceRule:{poor:0,acceptable:50,ideal:100}}],values:optionIds.map(optionId=>({optionId,criterionId,value:null}))}, "options");
  };
  const remove = async (item: DecisionSummary) => { try { const response = await deleteDecision(item.id, item.revision); setMessage(response.status === "deleted" ? "已删除" : response.status === "conflict" ? "记录已在其他标签页更新，请刷新后重试" : "记录已不存在"); await load(); } catch { setStorageError(true); setMessage("删除失败，请检查浏览器本地存储"); } };
  const duplicate = async (item: DecisionSummary) => { try { await duplicateDecision(item.id); setMessage("已创建副本"); await load(); } catch { setStorageError(true); setMessage("创建副本失败，请检查浏览器本地存储"); } };
  const decisionPath = (item: DecisionSummary) => `/decisions/${item.id}/${item.status === "complete" ? "results" : "options"}`;

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return; const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "set_decision_scenario_weights", title: "调整决策情景权重", description: "设置示例的四项重要程度并更新页面排名。", inputSchema: { type: "object", properties: { salary:{type:"number",minimum:0,maximum:60}, growth:{type:"number",minimum:0,maximum:60}, balance:{type:"number",minimum:0,maximum:60}, commute:{type:"number",minimum:0,maximum:60} }, required:["salary","growth","balance","commute"], additionalProperties:false }, annotations:{readOnlyHint:false,untrustedContentHint:false}, execute(input:unknown) { const x=input as Record<string,unknown>; const next=[x.salary,x.growth,x.balance,x.commute].map(Number); if(next.some(v=>!Number.isFinite(v)||v<0||v>60)||next.every(v=>v===0)) throw new Error("权重无效"); const normalized=normalizeWeightsToHundred(next)??next; setWeights(normalized); return {updated:true,weights:normalized}; } }, {signal:lifecycle.signal})).catch(()=>undefined);
    return () => lifecycle.abort();
  }, []);

  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border/80 bg-white/90 backdrop-blur"><div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-10"><button onClick={()=>setView("demo")} className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Scale size={19}/></span><span>DecisionLab <span className="hidden font-normal text-muted-foreground sm:inline">决策实验室</span></span></button><nav className="flex items-center gap-2"><Button variant={view==="decisions"?"secondary":"ghost"} onClick={()=>{void load();setView("decisions")}}>我的决策</Button><Button onClick={()=>setView("new")}><Plus size={16}/> 新建决策</Button></nav></div></header>
    {message && <StatusBanner className="mx-auto mt-5 max-w-[1360px]">{message}</StatusBanner>}
    {storageError && <StatusBanner tone="error" className="mx-auto mt-5 max-w-[1360px]">本地决策暂不可用；完整示例仍可正常体验。</StatusBanner>}
    {view === "demo" && <Demo weights={weights} setWeights={setWeights} ranked={ranked} onCopy={async()=>{try{const d=await createDecision(createOfferTemplate("工作 Offer 示例副本"));router.push(`/decisions/${d.id}/results`);}catch{setStorageError(true);setMessage("复制失败，请检查浏览器本地存储");}}}/>}
    {view === "decisions" && <DecisionList items={items} onOpen={item=>router.push(decisionPath(item))} onDuplicate={duplicate} onDelete={remove} onNew={()=>{setMessage("");setView("new");}} onPrefetch={item=>router.prefetch(decisionPath(item))}/>}
    {view === "new" && <section className="mx-auto max-w-5xl px-5 py-12"><button onClick={()=>setView("decisions")} className="mb-7 flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={16}/>返回我的决策</button><h1 className="text-4xl font-semibold tracking-tight">你正在决定什么？</h1><p className="mt-3 text-muted-foreground">选择贴近场景的模板，或从空白结构开始。</p><Card className="mt-8 p-7"><label htmlFor="decision-name" className="text-sm font-medium">决策名称</label><Input id="decision-name" className="mt-2 h-12 text-base" value={name} maxLength={100} onChange={e=>setName(e.target.value)}/><div className="mt-6 grid gap-4 md:grid-cols-2"><TemplateButton icon={<BriefcaseBusiness size={18}/>} title="工作 Offer 模板" detail="预置完整示例数据，创建后直接查看结果。" onClick={()=>void createFromInput(createOfferTemplate(name.trim()),"results")}/><TemplateButton icon={<HomeIcon size={18}/>} title="租房模板" detail="预置完整租房示例数据，创建后直接查看结果。" onClick={()=>void createFromInput(createRentTemplate(name.trim()),"results")}/><TemplateButton icon={<Laptop size={18}/>} title="笔记本模板" detail="预置完整笔记本示例数据，创建后直接查看结果。" onClick={()=>void createFromInput(createLaptopTemplate(name.trim()),"results")}/><TemplateButton icon={<Plus size={18}/>} title="空白决策" detail="从 2 个方案和 1 个因素开始，自定义比较结构。" onClick={()=>void createBlank()}/></div></Card></section>}
  </main>;
}

function TemplateButton({icon,title,detail,onClick}:{icon:ReactNode;title:string;detail:string;onClick:()=>void}) { return <button className="rounded-xl border bg-muted/30 p-5 text-left transition hover:border-primary hover:bg-blue-50" onClick={onClick}><div className="flex items-center gap-2 font-medium text-primary">{icon}<span className="text-foreground">{title}</span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">使用模板 <ArrowRight size={14}/></span></button>; }
function Demo({weights,setWeights,ranked,onCopy}:{weights:number[];setWeights:(v:number[])=>void;ranked:DemoRank[];onCopy:()=>void}) { return <section className="mx-auto max-w-[1440px] px-5 py-8 lg:px-10"><div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary"><BriefcaseBusiness size={16}/> 完整示例 · 工作 Offer 对比</div><h1 className="max-w-3xl text-3xl font-semibold tracking-[-.035em] md:text-5xl">权重一变，答案会不会也变？</h1><p className="mt-3 max-w-2xl leading-7 text-muted-foreground">拖动因素的重要程度，实时观察三个 Offer 的排名变化。分数不是答案，它让取舍变得清楚。</p></div><Button variant="outline" onClick={onCopy}><Copy size={16}/>复制并编辑</Button></div><div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]"><Card className="border-0 p-6 shadow-lg shadow-slate-200/50"><div className="mb-6 flex items-center justify-between"><div><h2 className="text-lg font-semibold">如果你更看重…</h2><p className="mt-1 text-sm text-muted-foreground">合计 {weights.reduce((a,b)=>a+b,0).toFixed(0)}%</p></div><Button variant="ghost" size="sm" onClick={()=>setWeights([35,30,20,15])}><RotateCcw size={15}/>恢复</Button></div><div className="space-y-7">{factors.map((factor,index)=><label key={factor.key} className="block"><span className="mb-3 flex justify-between text-sm"><span className="font-medium">{factor.name}</span><strong className="tabular-nums text-primary">{weights[index].toFixed(1)}%</strong></span><Slider value={[weights[index]]} min={0} max={100} step={1} onValueChange={([v])=>setWeights(rebalanceWeightArray(weights,index,v))}/></label>)}</div><div className="mt-7 grid grid-cols-3 gap-2"><Button variant="outline" size="sm" onClick={()=>setWeights([25,25,25,25])}>均衡</Button><Button variant="outline" size="sm" onClick={()=>setWeights([30,45,15,10])}>重成长</Button><Button variant="outline" size="sm" onClick={()=>setWeights([20,15,35,30])}>重生活</Button></div></Card><Rankings ranked={ranked}/></div></section>; }
function Rankings({ranked}:{ranked:DemoRank[]}) { return <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/50"><div className="border-b px-6 py-5"><h2 className="text-lg font-semibold">当前对比结果</h2><p className="mt-1 text-sm text-muted-foreground">综合得分已按当前重要程度重新计算</p></div><div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-8"><div className="space-y-6">{ranked.map(offer=><div key={offer.name}><div className="mb-2 flex items-end justify-between"><div className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-muted text-sm font-bold">{offer.rank}</span><b>{offer.name}</b></div><span className="text-2xl font-semibold tabular-nums">{offer.displayScore.toFixed(2)}</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all duration-500" style={{width:`${offer.score}%`,background:offer.color}}/></div></div>)}</div><div className="rounded-2xl bg-[#f4f7ff] p-5"><div className="text-xs font-semibold uppercase tracking-widest text-primary">领先方案</div><div className="mt-2 text-2xl font-semibold">{ranked[0].name}</div><p className="mt-3 text-sm leading-6 text-muted-foreground">当前权重下综合表现最优。继续调整左侧权重，查看结论是否稳定。</p></div></div></Card>; }
function DecisionList({items,onOpen,onDuplicate,onDelete,onNew,onPrefetch}:{items:DecisionSummary[];onOpen:(d:DecisionSummary)=>void;onDuplicate:(d:DecisionSummary)=>void;onDelete:(d:DecisionSummary)=>void;onNew:()=>void;onPrefetch:(d:DecisionSummary)=>void}) { return <section className="mx-auto max-w-6xl px-5 py-10"><div className="flex items-end justify-between"><div><h1 className="text-4xl font-semibold tracking-tight">我的决策</h1><p className="mt-2 text-muted-foreground">数据仅保存在当前浏览器中。</p></div><Button onClick={onNew}><Plus size={16}/>新建</Button></div>{items.length===0?<Card className="mt-8 grid place-items-center p-14 text-center"><Database className="text-muted-foreground"/><h2 className="mt-4 text-xl font-semibold">还没有本地决策</h2><p className="mt-2 text-sm text-muted-foreground">选择一个模板，创建你的第一份决策。</p><Button className="mt-5" onClick={onNew}>开始创建</Button></Card>:<div className="mt-8 grid gap-4">{items.map(item=><Card key={item.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" onMouseEnter={()=>onPrefetch(item)}><button className="text-left" onClick={()=>onOpen(item)}><div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{item.name}</h2><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.status==="complete"?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{item.status==="complete"?"已完成":"草稿"}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.optionCount} 个方案 · {item.criterionCount} 个因素</p></button><div className="flex gap-2"><Button variant="outline" onClick={()=>onDuplicate(item)}><Copy size={15}/>复制</Button><Button onMouseEnter={()=>onPrefetch(item)} onClick={()=>onOpen(item)}>{item.status==="complete"?"查看结果":"继续编辑"}</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" size="icon" aria-label={`删除${item.name}`}><Trash2 size={16}/></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除“{item.name}”？</AlertDialogTitle><AlertDialogDescription>此操作会删除当前浏览器中保存的决策，无法恢复。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={()=>onDelete(item)}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></Card>)}</div>}</section>; }
