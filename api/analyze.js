export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { bazi } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: '你是八字能量分析系统。收到八字后直接输出JSON，不输出任何其他文字。',
        messages: [{
          role: 'user',
          content: `分析八字：${bazi}\n\n严格按此JSON格式输出，不加任何说明文字，直接从{开始：\n{"rizhu":"","gejuming":"","qudongmoshi":"","gejuli":"","wuxing":{"火":0.0,"土":0.0,"木":0.0,"水":0.0,"金":0.0},"shishen_list":[{"shishen":"","defen":0.0,"zhuangtai":"已显化","jihuo_type":"","renqun":"前30%","shiji_nengli":"强"}],"nengliang_liyong":0.0,"neihao":{"zhi":0.0,"dengji":"","yuanyin":""},"kongbai":[],"gongzuo":{"he":[{"zuhe":"","gaoneng_ss":"","dineng_ss":"","fuzhetezhi":""}],"chong_tg":[{"zuhe":"","zhudong_ss":"","beidong_ss":"","biaoxian":""}]},"jieda":""}\n\n计算规则：\n地支权重：月令45% 时支30% 日支15% 年支10%\n衰减系数(月令五行为基准)：同气1.0 月令所生0.9 生月令0.5 克月令0.2 月令所克0.1\n天干系数：全盘有同五行地支=1.0 同柱地支生天干=0.6 否则=0.3 日主也算透干\n地支得分=权重×衰减×天干系数 能量利用率=四地支得分之和\n十神(日主为基准)：生我同阴阳=偏印 异=正印 我生同=食神 异=伤官 克我同=七杀 异=正官 我克同=偏财 异=正财 同我同=比肩 异=劫财\n格局=月令主气对日主十神 驱动：食神伤官=输出型 财官杀=掌控型 印比劫=内核型\n天干五合甲己乙庚丙辛丁壬戊癸=合激活持续稳定 天干六冲甲庚乙辛丙壬丁癸=冲激活脉冲爆发\n已显化=有透干且有根→人群前30% 潜力=有地支无透干 空白=五行缺失\njieda要求：300字第二人称，讲能量运转和做工激活，有洞察力让人感觉说的就是我`
        }]
      })
    });

    const data = await response.json();
    
    // 提取JSON
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      res.status(200).json({ result: match[0] });
    } else {
      res.status(200).json({ result: text });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
