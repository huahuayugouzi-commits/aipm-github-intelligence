import "./globals.css";
import Link from "next/link";

export const metadata = { title: "AIPM GitHub 智能情报助手", description: "AI 产品经理的开源项目情报平台" };

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="zh-CN"><body><div className="shell">
    <aside className="sidebar"><div className="logo">AIPM GitHub<span>智能情报助手</span></div><nav className="nav">
      <Link href="/">Dashboard</Link><Link href="/rankings">GitHub 排行榜</Link><Link href="/projects">项目分析</Link><Link href="/reports">情报周报</Link><Link href="/runs">运行记录</Link><Link href="/settings">系统设置</Link>
    </nav></aside><main className="main">{children}</main>
  </div></body></html>
}
