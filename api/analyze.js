export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { bazi } = req.body;

    const calcResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `你是八字能量计算引擎。严格按步骤计算，不使用规则集以外的任何概念（禁止使用空亡、神煞、大运、岁运等）。

【基础对照表】
天干五行阴阳：甲=阳木 乙=阴木 丙=阳火 丁=阴火 戊=阳土 己=阴土 庚=阳金 辛=阴金 壬=阳水 癸=阴水
地支主气五行：子=壬水 丑=己土 寅=甲木 卯=乙木 辰=戊土 巳=丙火 午=丁火 未=己土 申=庚金 酉=辛金 戌=戊土 亥=壬水
五行生克：木生火 火生土 土生金 金生水 水生木 / 木克土 土克水 水克火 火克金 金克木

【十神判断规则（以日主为基准）】
生我+同阴阳=偏印 / 生我+异阴阳=正印
我生+同阴阳=食神 / 我生+异阴阳=伤官
克我+同阴阳=七杀 / 克我+异阴阳=正官
我克+同阴阳=偏财 / 我克+异阴阳=正财
同我+同阴阳=比肩 / 同我+异阴阳=劫财

【能量计算规则】
地支权重：月令地支45% 时柱地支30% 日柱地支15% 年柱地支10%
衰减系数（以月令地支五行为基准）：同气=1.0 月令所生=0.9 生月令=0.5 克月令=0.2 月令所克=0.1
天干系数：全盘任意地支含同五行=1.0 / 同柱地支生该天干=0.6 / 否则=0.3
注意：日主天干也算透干
地支得分 = 权重 × 衰减系数 × 同柱天干系数
能量利用率 = 四地支得分之和（最大值为1.0，不归一化）
内耗 = 1.0 - 能量利用率

【格局规则】
格局 = 月令地支主气对日主的十神关系（只看月令主气，不看藏干）
驱动模式：食神/伤官=输出型 / 正财/偏财/正官/七杀=掌控型 / 正印/偏印/比肩/劫财=内核型

【地支状态规则】
已显化：该地支有天干透出（含日主）且该天干有根（全盘有同五行地支）
潜力：该地支有对应五行但无天干透出
空白：某五行既无天干也无地支

【做工关系】
天干五合（合激活·持续稳定）：甲己 乙庚 丙辛 丁壬 戊癸
天干六冲（冲激活·脉冲爆发）：甲庚 乙辛 丙壬 丁癸

按以下格式输出计算过程：
RIZHU: [日主天干/五行阴阳]
YUELING: [月令地支/五行]
YUELING_WUXING: [月令五行]
SHUAIJIAN: 火=[系数] 土=[系数] 木=[系数] 水=[系数] 金=[系数]

NIANZHI: [地支] 五行=[五行] 权重=0.10 衰减=[系数] 天干=[天干] 天干系数=[系数] 得分=[结果]
YUEZHI: [地支] 五行=[五行] 权重=0.45 衰减=[系数] 天干=[天干] 天干系数=[系数] 得分=[结果]
RIZHI: [地支] 五行=[五行] 权重=0.15 衰减=[系数] 天干=[天干] 天干系数=[系数] 得分=[结果]
SHIZHI: [地支] 五行=[五行] 权重=0.30 衰减=[系数] 天干=[天干] 天干系数=[系数] 得分=[结果]

WUXING_TOTAL: 火=[合计] 土=[合计] 木=[合计] 水=[合计] 金=[合计]
NENGLIANG_LIYONG: [四地支得分之和]
NEIHAO: [1.0减去利用率]

SHISHEN_LIST: [逐一列出每个地支的十神及得分，格式：十神=X 得分=Y 状态=Z]

GEJUMING: [格局名]
QUDONGMOSHI: [驱动模式]
GEJULI: [大格/中格/弱格]

HE: [天干合情况，无则写无]
CHONG: [天干冲情况，无则写无]`,
        messages: [{ role: 'user', content: `计算八字：${bazi}` }]
      })
    });

    const calcData = await calcResponse.json();
    const calcText = calcData.content?.[0]?.text || '';

    const outputResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: `你是八字能量报告生成器。根据计算结果生成JSON报告。只输出JSON，第一个字符必须是{，不输出任何其他文字。

【renqun字段规则——严格执行，不得自行调整】
已显化的十神：
- 非土五行 → 一律写"前30%"
- 土五行 → 一律写"前50%"
潜力状态 → 写"待激活"
空白 → 写"缺失"
禁止根据得分高低自行推算概率数字`,
        messages: [{
          role: 'user',
          content: `根据以下计算结果，生成JSON报告：

${calcText}

输出格式（严格JSON，直接从{开始）：
{
  "rizhu": "丙/阳火",
  "gejuming": "月建禄格",
  "qudongmoshi": "内核型",
  "gejuli": "大格",
  "wuxing": {"火": 0.45, "土": 0.27, "木": 0.05, "水": 0.03, "金": 0},
  "shishen_list": [
    {"shishen": "比肩", "defen": 0.45, "zhuangtai": "已显化", "jihuo_type": "", "renqun": "前30%", "shiji_nengli": "强"}
  ],
  "nengliang_liyong": 0.80,
  "neihao": {"zhi": 0.20, "dengji": "中内耗", "yuanyin": "说明内耗来源"},
  "kongbai": ["金"],
  "gongzuo": {
    "he": [{"zuhe": "甲己合", "gaoneng_ss": "食神", "dineng_ss": "偏印", "fuzhetezhi": "复合特质描述"}],
    "chong_tg": [{"zuhe": "丙壬冲", "zhudong_ss": "比肩", "beidong_ss": "七杀", "biaoxian": "行为表现描述"}]
  },
  "jieda": "300字能量解读，第二人称，有洞察力，让人感觉说的就是我，讲能量如何运转、做工激活带来的实际能力、内耗来源，不罗列，有叙事张力"
}`
        }]
      })
    });

    const outputData = await outputResponse.json();
    const outputText = outputData.content?.[0]?.text || '';
    const match = outputText.match(/\{[\s\S]*\}/);
    const jsonStr = match ? match[0] : outputText;

    try {
      const parsed = JSON.parse(jsonStr);
      parsed.shishen_list = Array.isArray(parsed.shishen_list) ? parsed.shishen_list : [];
      parsed.kongbai = Array.isArray(parsed.kongbai) ? parsed.kongbai : [];
      parsed.wuxing = parsed.wuxing || {};
      parsed.gongzuo = parsed.gongzuo || {};
      parsed.gongzuo.he = Array.isArray(parsed.gongzuo.he) ? parsed.gongzuo.he : [];
      parsed.gongzuo.chong_tg = Array.isArray(parsed.gongzuo.chong_tg) ? parsed.gongzuo.chong_tg : [];
      parsed.neihao = parsed.neihao || { zhi: 0, dengji: '', yuanyin: '' };
      res.status(200).json({ result: JSON.stringify(parsed), calc: calcText });
    } catch(e) {
      res.status(200).json({ result: jsonStr, calc: calcText });
    }

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
