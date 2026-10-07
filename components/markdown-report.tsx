import Link from "next/link";

function inline(text:string){
  const parts=text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*]+\*\*)/g);
  return parts.map((part,i)=>{const link=part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);if(link)return <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;if(part.startsWith("**")&&part.endsWith("**"))return <strong key={i}>{part.slice(2,-2)}</strong>;return part});
}

export function MarkdownReport({content}:{content:string}){
  const lines=content.split(/\r?\n/); const blocks:React.ReactNode[]=[]; let list:string[]=[];
  const flush=()=>{if(list.length){blocks.push(<ul key={`list-${blocks.length}`}>{list.map((x,i)=><li key={i}>{inline(x)}</li>)}</ul>);list=[]}};
  lines.forEach((line,index)=>{if(line.startsWith("- ")){list.push(line.slice(2));return}flush();if(line.startsWith("### "))blocks.push(<h3 key={index}>{inline(line.slice(4))}</h3>);else if(line.startsWith("## "))blocks.push(<h2 key={index}>{inline(line.slice(3))}</h2>);else if(line.startsWith("# "))blocks.push(<h1 key={index}>{inline(line.slice(2))}</h1>);else if(/^\d+\. /.test(line))blocks.push(<p className="numbered" key={index}>{inline(line)}</p>);else if(line.trim())blocks.push(<p key={index}>{inline(line)}</p>)});flush();
  return <article className="card report-content">{blocks}</article>;
}
