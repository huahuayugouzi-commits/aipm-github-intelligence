type Point = { captured_at: string; stars: number; forks?: number };

export function TrendChart({points}:{points:Point[]}){
  if(points.length<2)return <div className="empty-chart"><strong>历史趋势正在积累</strong><span>至少需要两次不同日期的采集快照，当前有 {points.length} 个数据点。</span></div>;
  const width=720,height=220,pad=34;
  const values=points.map(p=>Number(p.stars)); const min=Math.min(...values),max=Math.max(...values); const range=Math.max(1,max-min);
  const coords=points.map((p,i)=>({x:pad+i*(width-pad*2)/Math.max(1,points.length-1),y:height-pad-(Number(p.stars)-min)*(height-pad*2)/range,...p}));
  const line=coords.map(p=>`${p.x},${p.y}`).join(" "); const area=`${pad},${height-pad} ${line} ${width-pad},${height-pad}`;
  return <div className="trend"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Star 历史趋势图"><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6657f2" stopOpacity=".28"/><stop offset="1" stopColor="#6657f2" stopOpacity=".02"/></linearGradient></defs><line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} className="axis"/><polygon points={area} fill="url(#trendFill)"/><polyline points={line} className="trend-line"/>{coords.map((p,i)=><g key={`${p.captured_at}-${i}`}><circle cx={p.x} cy={p.y} r="4"/><title>{p.captured_at}: {p.stars.toLocaleString()} stars</title></g>)}<text x={pad} y={18}>{max.toLocaleString()}</text><text x={pad} y={height-8}>{points[0].captured_at}</text><text x={width-pad} y={height-8} textAnchor="end">{points.at(-1)?.captured_at}</text></svg><div className="trend-summary"><span>起点 <strong>{values[0].toLocaleString()}</strong></span><span>当前 <strong>{values.at(-1)?.toLocaleString()}</strong></span><span>累计变化 <strong className={(values.at(-1)||0)-values[0]>=0?"positive":"negative"}>{(values.at(-1)||0)-values[0]>=0?"+":""}{((values.at(-1)||0)-values[0]).toLocaleString()}</strong></span></div></div>
}
