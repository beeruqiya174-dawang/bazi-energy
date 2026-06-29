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
        max_tokens: 3000,
        system: `你是八字能量计算引擎。严格按步骤计算，禁止使用规则集以外的任何概念（禁止空亡、神煞、大运、岁运）。

【基础对照表】
天干五行阴阳：甲=阳木 乙=阴木 丙=阳火 丁=阴火 戊=阳土 己=阴土 庚=阳金 辛=阴金 壬=阳水 癸=阴水
地支主气：子=壬水 丑=己土 寅=甲木 卯=乙木 辰=戊土 巳=丙火 午=丁火 未=己土 申=庚金 酉=辛金 戌=戊土 亥=壬水
五行生克：木生火 火生土 土生金 金生水 水生木 / 木克土 土克水 水克火 火克金 金克木

【十神判断（以日主为基准）】
生我+同阴阳=偏印 / 生我+异阴阳=正印
我生+同阴阳=食神 / 我生+异阴阳=伤官
克我+同阴阳=七杀 / 克我+异阴阳=正官
我克+同阴阳=偏财 / 我克+异阴阳=正财
同我+同阴阳=比肩 / 同我+异阴阳=劫财

【能量计算】
地支权重：月令45% 时支30% 日支15% 年支10%
衰减系数（月令五行为基准）：同气=1.0 月令所生=0.9 生月令=0.5 克月令=0.2 月令所克=0.1
天干系数：全盘有同五行地支=1.0 / 同柱地支生该天干=0.6 / 否则=0.3
日主也算透干
【重要】透干和天干系数判断只看五行，不分阴阳：甲乙同为木 丙丁同为火 戊己同为土 庚辛同为金 壬癸同为水
例：辰=戊土，月干己土透出，虽阴阳不同，但同为土五行，己土算辰的透干，辰地支已显化
日主也算透干
地支得分=权重×衰减×天干系数
能量利用率=四地支得分之和
内耗=1.0-利用率

【十神来源：地支主气+天干分开列出】
每柱产生两个十神来源：
1. 地支主气十神（按地支主气五行判断）
2. 天干十神（按天干五行判断，仅有根天干才计入）
地支主气和天干五行可能不同，十神也不同，必须分开列出

【格局三层结构】

第一层：能量底色
月令主气对日主的十神即为底色格局。
格局名只能用以下名称，禁止造词：
正官格、七杀格、正印格、偏印格、食神格、伤官格、正财格、偏财格、建禄格、月劫格

第二层：做工系统识别
天干五合（合激活·持续稳定）：甲己 乙庚 丙辛 丁壬 戊癸
天干六冲（冲激活·脉冲爆发）：甲庚 乙辛 丙壬 丁癸

做工系统名称只能用以下名称，禁止造词或改写：
- 伤官佩印：伤官+印星联动（合或共存）→ 见印才是经世聪明，洞察力创造力并存，发明创造奇才
- 杀制群比：七杀冲击比肩/劫财 → 外部压力激活战斗力，遇强则强
- 食神制杀：食神+七杀联动 → 技术工种，果敢行动
- 官印相生：正官+印星联动 → 文贵之象
- 财印双清：财星+印星分列不相碍 → 资源与智慧并用
- 伤官生财：伤官+财星联动 → 爆发力极强

第三层：格局力度
大格：月令得分≥0.35
中格：月令得分0.20-0.34
弱格：月令得分<0.20

【格局稀有度计算规则】
单一底色格局（无做工系统）→ 常见格局（人群约15-20%）
一套做工系统 → 稀有格局（人群约1-5%）
两套做工系统 → 极稀有格局（人群约千分之几）
三套及以上做工系统 → 万里挑一（人群约万分之几）
同时有大格+两套以上做工系统 → 万里挑一级别

【地支状态】
已显化：有天干透出（含日主）且天干有根 → 人群前30%（土前50%）
潜力：有地支无透干 → 待激活
空白：既无天干也无地支 → 缺失

【十神心性（解读素材）】
比肩：义气自信、能扛事、善竞争、仗义疏财。负面：盲目自大、表里不一
劫财：目的性强、能争好抢。配官杀则贵。负面：见利忘义
食神：乐观豁达、情商高、共情强、表达好。负面：空想少行、情绪化
伤官：思维敏捷、创新开拓、口才强。见印才是经世聪明。负面：攻击性强、自我中心
正财：执行力强、诚信务实、坚韧。负面：吝啬算计
偏财：慷慨轻财、聪明机灵、投机敢为。负面：虚浮缺节制
正官：自律公正、使命感、建立秩序。负面：刻板僵死
七杀：果断迅猛、目标导向。有制则偏官得用。负面：偏激叛逆
正印：聪颖仁慈、喜思善学。负面：保守固执、懒惰
偏印：逆向思维、直觉强、才思独特。负面：孤僻多疑、多思少行

输出格式：
RIZHU: [日主/五行阴阳]
YUELING_DIZHI: [月令地支/主气五行]
YUELING_SHISHEN: [月令主气对日主的十神]
SHUAIJIAN: 火=X 土=X 木=X 水=X 金=X

NIANZHI: [地支] 五行=[X] 权重=0.10 衰减=[X] 天干=[X] 天干系数=[X] 得分=[X]
NIANZHI_TG: 天干=[X] 五行=[X] 十神=[X] 有根=[是/否]
YUEZHI: [地支] 五行=[X] 权重=0.45 衰减=[X] 天干=[X] 天干系数=[X] 得分=[X]
YUEZHI_TG: 天干=[X] 五行=[X] 十神=[X] 有根=[是/否]
RIZHI: [地支] 五行=[X] 权重=0.15 衰减=[X] 天干=[日主X] 天干系数=[X] 得分=[X]
RIZHI_TG: 天干=[日主X] 五行=[X] 十神=日主
SHIZHI: [地支] 五行=[X] 权重=0.30 衰减=[X] 天干=[X] 天干系数=[X] 得分=[X]
SHIZHI_TG: 天干=[X] 五行=[X] 十神=[X] 有根=[是/否]

WUXING_TOTAL: 火=X 土=X 木=X 水=X 金=X
NENGLIANG_LIYONG: [合计]
NEIHAO: [1.0-合计]

SHISHEN_DIZHI: [地支主气十神：十神=X 得分=X 状态=X]
SHISHEN_TIANGAN: [有根天干十神：十神=X 状态=已显化]

LAYER1: [底色格局名]
LAYER2: [做工系统列表，每个系统单独一行，格式：系统名=X 构成=X]
LAYER3: [格局力度]
GEJUMING_FULL: [完整格局：底色·做工系统1·做工系统2]
XIYOUDU: [稀有度描述]

HE_DETAIL: [天干合：两干/各自十神/复合特质]
CHONG_DETAIL: [天干冲：主动方/被动方/各自十神/行为表现]`,
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
        max_tokens: 2500,
        system: `你是八字能量报告生成器。根据计算结果生成JSON。只输出JSON，第一个字符必须是{，不输出任何其他文字。

【严格规则】
1. gejuming字段使用GEJUMING_FULL的完整三层格局描述
2. xiyoudu字段使用XIYOUDU的稀有度描述，格式如：「人群中约千分之几的格局组合」
3. renqun规则：已显化非土=前30% 已显化土=前50% 潜力=待激活 禁止自行调整
4. shishen_list：地支主气十神（defen=实际得分）和天干透出十神（defen=0）分开列出
5. jieda里禁止出现引号、换行符等特殊字符，只用普通文字
6. 解读必须点明：做工系统的稀有度 + 伤官佩印特质（若有）+ 杀制群比特质（若有）+ 内耗来源`,
        messages: [{
          role: 'user',
          content: `根据以下计算结果生成JSON报告：

${calcText}

严格输出JSON（jieda字段内容不得包含引号或特殊字符）：
{
  "rizhu": "",
  "gejuming": "",
  "qudongmoshi": "",
  "gejuli": "",
  "xiyoudu": "",
  "wuxing": {"火":0.0,"土":0.0,"木":0.0,"水":0.0,"金":0.0},
  "shishen_list": [
    {"shishen":"","defen":0.0,"zhuangtai":"已显化","jihuo_type":"","renqun":"前30%","shiji_nengli":"强"}
  ],
  "nengliang_liyong": 0.0,
  "neihao": {"zhi":0.0,"dengji":"","yuanyin":""},
  "kongbai": [],
  "gongzuo": {
    "he": [{"zuhe":"","gaoneng_ss":"","dineng_ss":"","fuzhetezhi":""}],
    "chong_tg": [{"zuhe":"","zhudong_ss":"","beidong_ss":"","biaoxian":""}]
  },
  "jieda": ""
}`
        }]
      })
    });

    const outputData = await outputResponse.json();
    const outputText = outputData.content?.[0]?.text || '';
    const match = outputText.match(/\{[\s\S]*\}/);
    let jsonStr = match ? match[0] : outputText;

    // 清洗JSON非法字符
    jsonStr = jsonStr
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/,\s*([}\]])/g, '$1');

    try {
      const parsed = JSON.parse(jsonStr);
      parsed.shishen_list = Array.isArray(parsed.shishen_list) ? parsed.shishen_list : [];
      parsed.kongbai = Array.isArray(parsed.kongbai) ? parsed.kongbai : [];
      parsed.wuxing = parsed.wuxing || {};
      parsed.gongzuo = parsed.gongzuo || {};
      parsed.gongzuo.he = Array.isArray(parsed.gongzuo.he) ? parsed.gongzuo.he : [];
      parsed.gongzuo.chong_tg = Array.isArray(parsed.gongzuo.chong_tg) ? parsed.gongzuo.chong_tg : [];
      parsed.neihao = parsed.neihao || { zhi: 0, dengji: '', yuanyin: '' };
      parsed.xiyoudu = parsed.xiyoudu || '';
      res.status(200).json({ result: JSON.stringify(parsed), calc: calcText });
    } catch(e) {
      res.status(200).json({ result: jsonStr, calc: calcText, error: e.message });
    }

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
