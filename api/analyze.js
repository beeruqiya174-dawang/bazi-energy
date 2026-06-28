export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages } = req.body;

    const systemPrompt = `你是八字能量分析系统。只输出JSON，不输出任何其他文字，不输出解释，不输出markdown，直接输出花括号开头的JSON。

【基础对照】
天干五行阴阳：甲=阳木 乙=阴木 丙=阳火 丁=阴火 戊=阳土 己=阴土 庚=阳金 辛=阴金 壬=阳水 癸=阴水
地支主气：子=癸水 丑=己土 寅=甲木 卯=乙木 辰=戊土 巳=丙火 午=丁火 未=己土 申=庚金 酉=辛金 戌=戊土 亥=壬水
地支阴阳：子阳 丑阴 寅阳 卯阴 辰阳 巳阴 午阳 未阴 申阳 酉阴 戌阳 亥阴
五行生克：木生火 火生土 土生金 金生水 水生木 / 木克土 土克水 水克火 火克金 金克木

【能量计算】
地支权重：月令45% 时支30% 日支15% 年支10%
衰减系数（月令五行为基准）：同气=1.0 月令所生=0.9 生月令=0.5 克月令=0.2 月令所克=0.1
天干系数：全盘任意地支含同五行=1.0 / 同柱地支生该天干五行=0.6 / 以上都不满足=0.3
日主天干也算透干
地支得分=权重×衰减系数×天干系数
能量利用率=四地支得分之和（不归一化）
内耗=1.0-能量利用率

【地支三种状态】
已显化：地支有对应天干透出（含日主）且天干有根→人群前30%稳定能力资产（土约前50%）
潜力：地支有对应五行但无天干透出→待激活
空白：某五行既无天干也无地支→能量缺失

【十神（日主为基准）】
生我同阴阳=偏印 生我异阴阳=正印 我生同阴阳=食神 我生异阴阳=伤官
克我同阴阳=七杀 克我异阴阳=正官 我克同阴阳=偏财 我克异阴阳=正财 同我同阴阳=比肩 同我异阴阳=劫财

【格局】月令地支主气对日主十神关系即格局
驱动模式：食神/伤官=输出型 正财/偏财/正官/七杀=掌控型 正印/偏印/比肩/劫财=内核型

【做工关系与动能转化】
天干五合：甲己 乙庚 丙辛 丁壬 戊癸→合激活·持续稳定，高能量带动低能量，复合特质=[十神A]×[十神B]逻辑推导
天干六冲：甲庚 乙辛 丙壬 丁癸→冲激活·脉冲爆发，强方主动冲击弱方
地支六冲：子午 丑未 寅申 卯酉 辰戌 巳亥→做工受压不稳定

【内耗等级】0-10%=低内耗 10-25%=中内耗 25-40%=高内耗 40%+=极高内耗

【解读要求】300字，第二人称「你」，有洞察力，让人感觉「说的就是我」，讲能量如何运转、做工激活带来的实际能力、内耗来源，不罗列，有叙事张力。

直接输出JSON，第一个字符必须是{：
{"rizhu":"","gejuming":"","qudongmoshi":"","gejuli":"","dizhi_mingxi":[{"zhu":"月令","dizhi":"","wuxing":"","quanzhong":0.45,"shuaijian":0.0,"tianganxi":0.0,"defen":0.0,"shishen":"","zhuangtai":"","renqun":""}],"wuxing":{"火":0.0,"土":0.0,"木":0.0,"水":0.0,"金":0.0},"shishen_list":[{"shishen":"","defen":0.0,"zhuangtai":"已显化","jihuo_type":"","renqun":"前30%","shiji_nengli":"强"}],"nengliang_liyong":0.0,"neihao":{"zhi":0.0,"dengji":"","yuanyin":""},"kongbai":[],"gongzuo":{"he":[{"zuhe":"","gaoneng_ss":"","dineng_ss":"","fuzhetezhi":""}],"chong_tg":[{"zuhe":"","zhudong_ss":"","beidong_ss":"","biaoxian":""}],"chong_dz":[{"zuhe":"","yingxiang":""}]},"jieda":""}`;

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
        system: systemPrompt,
        messages: messages
      })
    });

const data = await response.json();

// 强制提取JSON
if (data.content && data.content[0] && data.content[0].text) {
  const text = data.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    data.content[0].text = jsonMatch[0];
  }
}

res.status(response.status).json(data);  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
