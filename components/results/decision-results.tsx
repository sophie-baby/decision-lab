"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Gauge, Pencil, RotateCcw, Scale } from "lucide-react";
import { analyzeSensitivity, analyzeTradeoffs, calculateDecision, compareScenario, normalizeWeightRecord, rebalanceWeightRecord, type Decision } from "@/lib/decision-domain";
import { getDecision } from "@/lib/decision-repository";
import { CompleteDecisionSchema, getMissingDecisionItems } from "@/lib/decision-validation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { ErrorState } from "@/components/ui/error-state";
const loadCharts = () => import("./chart-primitives");
const ChartContainer = dynamic(() => loadCharts().then(module => module.ChartContainer));
const ChartTooltip = dynamic(() => loadCharts().then(module => module.ChartTooltip));
const ChartTooltipContent = dynamic(() => loadCharts().then(module => module.ChartTooltipContent));
const Bar = dynamic(() => loadCharts().then(module => module.Bar));
const BarChart = dynamic(() => loadCharts().then(module => module.BarChart));
const CartesianGrid = dynamic(() => loadCharts().then(module => module.CartesianGrid));
const XAxis = dynamic(() => loadCharts().then(module => module.XAxis));
const YAxis = dynamic(() => loadCharts().then(module => module.YAxis));

function preferenceLabel(decision:Decision, criterionId:string) {
  const criterion=decision.criteria.find(item=>item.id===criterionId);
  if(!criterion)return "未知偏好规则";
  if(criterion.type==="subjective")return "主观五档：很差 0 / 较差 25 / 一般 50 / 较好 75 / 很好 100";
  const direction=criterion.direction==="higher"?"越高越好":"越低越好";
  const {poor,acceptable,ideal}=criterion.preferenceRule;
  return `${direction} · 不满意 ${poor} / 可接受 ${acceptable} / 理想 ${ideal}${criterion.unit?` ${criterion.unit}`:""}`;
}

export default function DecisionResults({mode}:{mode:"results"|"scenario"|"sensitivity"}) {
  const params=useParams<{id:string}>();
  const router=useRouter();
  const [decision,setDecision]=useState<Decision|null>(null);
  const [message,setMessage]=useState("正在加载…");
  useEffect(()=>{void getDecision(params.id).then(value=>{setDecision(value);setMessage(value?"":"这份决策不存在或已被删除。");}).catch(()=>setMessage("无法读取本地决策。"));},[params.id]);
  if(!decision)return <ErrorState title={message==="正在加载…"?"正在加载":"无法打开决策"} message={message} onAction={()=>router.push("/")}/>;
  const complete=CompleteDecisionSchema.safeParse(decision).success;
  if(!complete){const missing=getMissingDecisionItems(decision);return <main className="grid min-h-screen place-items-center bg-background px-5"><Card className="w-full max-w-xl p-8"><h1 className="text-2xl font-semibold">这份决策还不能计算结果</h1><p className="mt-2 text-sm text-muted-foreground">请先完成以下内容：</p><ul className="mt-5 space-y-2 text-sm">{missing.slice(0,8).map((item,index)=><li className="rounded-lg bg-muted px-3 py-2" key={`${item.code}-${index}`}>{item.message}</li>)}</ul><Button className="mt-6" onClick={()=>router.push(`/decisions/${decision.id}/options`)}>继续编辑</Button></Card></main>}
  return mode==="scenario"?<Scenario decision={decision}/>:mode==="sensitivity"?<Sensitivity decision={decision}/>:<><Results decision={decision}/><Button className="fixed bottom-5 right-5 shadow-lg" onClick={()=>router.push(`/decisions/${decision.id}/sensitivity`)}><Gauge size={16}/>敏感性分析</Button></>;
}

function Results({decision}:{decision:Decision}) {
  const router=useRouter();
  const result=useMemo(()=>calculateDecision(decision),[decision]);
  const tradeoffs=useMemo(()=>analyzeTradeoffs(result),[result]);
  const criterionName=(id:string)=>decision.criteria.find(item=>item.id===id)?.name??"未知因素";
  const scoreData=result.map(option=>({name:option.name,score:option.displayScore}));
  const factorData: Array<Record<string,string|number>>=decision.criteria.map(criterion=>{
    const row:Record<string,string|number>={factor:criterion.name};
    result.forEach(option=>{row[option.id]=option.details.find(detail=>detail.criterionId===criterion.id)!.preferenceScore;});
    return row;
  });
  const palette=["#175cd3","#e35f45","#7b61c9","#159570","#b7791f"];
  return <main className="min-h-screen bg-background text-foreground"><section className="mx-auto max-w-6xl px-5 py-10"><button className="flex items-center gap-2 text-sm text-muted-foreground" onClick={()=>router.push("/")}><ArrowLeft size={16}/>返回我的决策</button><div className="mt-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm text-emerald-700">已保存</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">{decision.name}</h1></div><div className="flex gap-2"><Button variant="outline" onClick={()=>router.push(`/decisions/${decision.id}/options`)}><Pencil size={16}/>编辑</Button><Button onClick={()=>router.push(`/decisions/${decision.id}/scenario`)}><Scale size={16}/>情景分析</Button></div></div><div className="mt-8 grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><Card className="p-6"><h2 className="text-lg font-semibold">综合排名</h2><div className="mt-6 space-y-5">{result.map(option=><div key={option.id}><div className="mb-2 flex justify-between"><span><b className="mr-3 text-primary">#{option.rank}</b>{option.name}</span><b className="text-xl tabular-nums">{option.displayScore.toFixed(2)}</b></div><div className="h-2.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{width:`${option.displayScore}%`}}/></div></div>)}</div></Card><Card className="p-5"><h2 className="text-lg font-semibold">综合得分</h2><ChartContainer className="mt-4 h-[260px] w-full" config={{score:{label:"综合得分",color:"#175cd3"}}}><BarChart data={scoreData} layout="vertical" margin={{left:12,right:24}}><CartesianGrid horizontal={false}/><XAxis type="number" domain={[0,100]}/><YAxis type="category" dataKey="name" width={80}/><ChartTooltip content={<ChartTooltipContent/>}/><Bar dataKey="score" fill="var(--color-score)" radius={6}/></BarChart></ChartContainer></Card></div><Card className="mt-5 p-5"><h2 className="text-lg font-semibold">各因素表现</h2><p className="mt-1 text-sm text-muted-foreground">同一因素下比较各方案的符合程度。</p><ChartContainer className="mt-4 h-[320px] w-full" config={Object.fromEntries(result.map((option,index)=>[option.id,{label:option.name,color:palette[index%palette.length]}]))}><BarChart data={factorData}><CartesianGrid vertical={false}/><XAxis dataKey="factor"/><YAxis domain={[0,100]}/><ChartTooltip content={<ChartTooltipContent/>}/>{result.map((option,index)=><Bar key={option.id} dataKey={option.id} name={option.name} fill={palette[index%palette.length]} radius={4}/>)}</BarChart></ChartContainer></Card><Card className="mt-5 overflow-hidden"><div className="border-b p-5"><h2 className="text-lg font-semibold">得分明细</h2><p className="mt-1 text-sm text-muted-foreground">原始数据 → 偏好规则 → 符合程度 → 权重 → 分数贡献</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-muted/60"><tr><th className="p-3 text-left">方案 / 因素</th>{decision.criteria.map(item=><th className="p-3 text-left" key={item.id}>{item.name}</th>)}</tr></thead><tbody>{result.map(option=><tr className="border-t" key={option.id}><th className="p-3 text-left">{option.name}</th>{option.details.map(detail=><td className="p-3" key={detail.criterionId}><div>{String(detail.raw)} → {detail.preferenceScore.toFixed(0)} 分</div><div className="mt-1 max-w-48 text-xs text-muted-foreground">{preferenceLabel(decision,detail.criterionId)}</div><div className="mt-1 text-xs text-muted-foreground">{(detail.normalizedWeight*100).toFixed(2)}% · 贡献 {detail.contribution.toFixed(2)}</div></td>)}</tr>)}</tbody></table></div></Card><div className="mt-6 grid gap-4 lg:grid-cols-3">{result.map(option=>{const analysis=tradeoffs.find(item=>item.optionId===option.id)!;return <Card className="p-5" key={option.id}><h3 className="font-semibold">{option.name}</h3><p className="mt-4 text-sm font-medium text-emerald-700">主要优势</p><p className="mt-2 text-sm text-muted-foreground">{analysis.strengths.length?analysis.strengths.map(item=>criterionName(item.criterionId)).join("、"):"暂无达到优势阈值的因素"}</p><p className="mt-4 text-sm font-medium text-orange-700">需要取舍</p><p className="mt-2 text-sm text-muted-foreground">{analysis.tradeoffs.length?analysis.tradeoffs.map(item=>criterionName(item.criterionId)).join("、"):"暂无达到取舍阈值的因素"}</p></Card>})}</div></section></main>;
}

function Scenario({decision}:{decision:Decision}) {
  const router=useRouter();
  const original=useMemo(()=>normalizeWeightRecord(Object.fromEntries(decision.criteria.map(item=>[item.id,item.weight]))),[decision]);
  const [weights,setWeights]=useState<Record<string,number>>(original);
  const base=useMemo(()=>calculateDecision(decision),[decision]);
  const comparison=useMemo(()=>compareScenario(decision,weights,base),[decision,weights,base]);
  const driverNames=comparison.drivers.map(driver=>decision.criteria.find(item=>item.id===driver.criterionId)?.name).filter(Boolean);
  const scenarioTradeoffs=useMemo(()=>analyzeTradeoffs(comparison.scenario),[comparison.scenario]);
  const leaderAnalysis=scenarioTradeoffs.find(item=>item.optionId===comparison.scenario[0].id)!;
  const names=(ids:{criterionId:string}[])=>ids.map(item=>decision.criteria.find(criterion=>criterion.id===item.criterionId)?.name).filter(Boolean).join("、");
  const applyPreset=(kind:"balanced"|"career"|"lifestyle")=>{
    if(kind==="balanced"){
      const value=100/decision.criteria.length;
      setWeights(Object.fromEntries(decision.criteria.map(item=>[item.id,value])));
      return;
    }
    setWeights(normalizeWeightRecord(Object.fromEntries(decision.criteria.map(item=>{
      const career=/成长|薪资|发展/.test(item.name);
      const life=/生活|通勤|平衡/.test(item.name);
      return [item.id,(kind==="career"?career:life)?45:10];
    }))));
  };
  const offerSpecific=decision.source==="offer-template"||decision.source==="demo-copy";
  return <main className="min-h-screen bg-background text-foreground"><section className="mx-auto max-w-6xl px-5 py-10">
    <button className="flex items-center gap-2 text-sm text-muted-foreground" onClick={()=>router.push(`/decisions/${decision.id}/results`)}><ArrowLeft size={16}/>返回结果</button>
    <div className="mt-7 flex items-end justify-between gap-4"><div><p className="text-sm font-medium text-primary">Scenario Analysis</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">如果重要程度改变</h1><p className="mt-2 text-muted-foreground">临时调整不会修改已保存的决策。</p></div><Button variant="outline" onClick={()=>setWeights(original)}><RotateCcw size={16}/>恢复原始设置</Button></div>
    <div className="mt-5 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>applyPreset("balanced")}>均衡情景</Button>{offerSpecific&&<><Button size="sm" variant="outline" onClick={()=>applyPreset("career")}>重成长</Button><Button size="sm" variant="outline" onClick={()=>applyPreset("lifestyle")}>重生活</Button></>}</div>
    <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]"><Card className="p-6"><div className="space-y-7">{decision.criteria.map(criterion=><label className="block" key={criterion.id}><span className="mb-3 flex justify-between text-sm"><span className="font-medium">{criterion.name}</span><b>{weights[criterion.id].toFixed(1)}%</b></span><Slider value={[weights[criterion.id]]} min={0} max={100} step={1} onValueChange={([value])=>setWeights(current=>rebalanceWeightRecord(current,criterion.id,value))}/></label>)}</div></Card>
      <Card className="p-6"><h2 className="text-lg font-semibold">情景排名</h2><div className="mt-6 space-y-4">{comparison.scenario.map(option=>{const change=comparison.changes.find(item=>item.optionId===option.id)!;return <div className="flex items-center justify-between rounded-xl border p-4" key={option.id}><span><b className="mr-3 text-primary">#{option.rank}</b>{option.name}</span><span className="text-right"><b className="tabular-nums">{option.displayScore.toFixed(2)}</b><small className="ml-3 text-muted-foreground">原 #{change.oldRank}</small></span></div>})}</div><div className="mt-6 rounded-xl bg-muted p-4 text-sm leading-6">{comparison.rankingChanged?(driverNames.length?`排名变化主要由 ${driverNames.join("、")} 的相对贡献变化推动。`:"排名出现并列变化，没有形成明确的方案换位原因。") : "排名未发生变化；各因素贡献会随权重同步更新。"}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm"><b className="text-emerald-800">当前第一名的主要优势</b><p className="mt-2 text-emerald-900">{leaderAnalysis.strengths.length?names(leaderAnalysis.strengths):"暂无达到优势阈值的因素"}</p></div><div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm"><b className="text-orange-800">当前第一名需要取舍</b><p className="mt-2 text-orange-900">{leaderAnalysis.tradeoffs.length?names(leaderAnalysis.tradeoffs):"暂无达到取舍阈值的因素"}</p></div></div></Card>
    </div>
  </section></main>;
}

function Sensitivity({decision}:{decision:Decision}) {
  const router=useRouter();
  const analysis=useMemo(()=>analyzeSensitivity(decision),[decision]);
  const base=useMemo(()=>calculateDecision(decision),[decision]);
  const optionName=(id:string|null)=>decision.options.find(item=>item.id===id)?.name??"新的并列结果";
  const criterionName=(id:string)=>decision.criteria.find(item=>item.id===id)?.name??"未知因素";
  const sensitive=analysis.filter(item=>item.thresholdWeight!==null);
  return <main className="min-h-screen bg-background text-foreground"><section className="mx-auto max-w-5xl px-5 py-10"><button className="flex items-center gap-2 text-sm text-muted-foreground" onClick={()=>router.push(`/decisions/${decision.id}/results`)}><ArrowLeft size={16}/>返回结果</button><div className="mt-7"><p className="text-sm font-medium text-primary">Sensitivity Analysis</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">结果对哪些因素最敏感？</h1><p className="mt-3 text-muted-foreground">单独改变一个因素的重要程度，寻找距离当前设置最近的排名临界点。当前第一名：{base.filter(item=>item.rank===1).map(item=>item.name).join("、")}。</p></div><div className="mt-8 space-y-4">{analysis.map((item,index)=><Card className="p-5" key={item.criterionId}><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${index===0&&item.thresholdWeight!==null?"bg-orange-100 text-orange-800":"bg-muted text-muted-foreground"}`}>{index+1}</span><h2 className="font-semibold">{criterionName(item.criterionId)}</h2></div><p className="ml-11 mt-2 text-sm text-muted-foreground">当前权重 {item.currentWeight.toFixed(0)}%</p></div>{item.thresholdWeight===null?<p className="text-sm text-emerald-700">在 0–100% 范围内单独调整不会改变第一名</p>:<div className="sm:text-right"><p className="font-semibold">{item.direction==="increase"?"提高":"降低"}到约 {item.thresholdWeight}%</p><p className="mt-1 text-sm text-muted-foreground">可能由 {optionName(item.newLeaderId)} 领先 · 相差 {item.distance?.toFixed(0)} 个百分点</p></div>}</div></Card>)}</div>{sensitive.length>0&&<Card className="mt-6 border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-950"><b>最值得复核：</b>{criterionName(sensitive[0].criterionId)}只需变化约 {sensitive[0].distance?.toFixed(0)} 个百分点就可能改变结果。建议先确认这个因素的权重和原始数据。</Card>}<p className="mt-5 text-xs leading-5 text-muted-foreground">调整一个因素时，其余权重会按比例重新分配。这里展示的是可能改变排名的最近权重值。</p></section></main>;
}
