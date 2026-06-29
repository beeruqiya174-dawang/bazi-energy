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
地支得分=权重×衰减×天干系数
能量利用率=四地支得分之和
内耗=1.0-利用率

【十神来源：地支主气+天干分开列出】
每柱产生两个十神来源：
1. 地支主气十神（按地支主气五行判断）
2. 天干十神（按天干五行判断，仅有根天干才计入）
注意：地支主气和天干的五行可能不同，十神也不同，必须分开列出

【格局三层结构——核心升级】

第一层：能量底色（月令主气对日主的十神）
月令主气决定能量底色，即这个人的核心能量场是什么。
格局名：正官格/七杀格/正印格/偏印格/食神格/伤官格/正财格/偏财格/建禄格/月劫格

第二层：识别做工系统（天干合冲形成的动态结构）
做工系统是命盘能量真正运转的方式。逐一检查以下组合：

天干五合（合激活·持续稳定做工）：甲己 乙庚 丙辛 丁壬 戊癸
天干六冲（冲激活·脉冲爆发做工）：甲庚 乙辛 丙壬 丁癸

识别重要做工系统组合：
A. 伤官佩印：伤官天干+印星天干（正印或偏印）通过合或共存联动 → 经世聪明，洞察力创造力并存，发明创造解决问题的奇才，见印制伤，大贵之象
B. 杀制群比：七杀冲击比肩/劫财 → 外部压力激活战斗力，遇强则强，脉冲爆发
C. 食神制杀：食神+七杀联动 → 技术工种，果敢行动，直击要害
D. 官印相生：正官+印星联动 → 文贵之象，权力与智慧兼备
E. 财印双清：财星+印星分列两端不相碍 → 资源与智慧并用
F. 伤官生财：伤官+财星联动 → 爆发力极强，创新变现

第三层：格局力度判断
大格：月令得分≥0.35
中格：月令得分0.20-0.34
弱格：月令得分<0.20

【地支状态】
已显化：有天干透出（含日主）且天干有根 → 人群前30%稳定能力（土前50%）
潜力：有地支无透干 → 待激活
空白：既无天干也无地支 → 缺失

【十神心性参考（用于解读，不用于计算）】
比肩：义气自信、能扛事、善竞争、仗义疏财。负面：盲目自大、表里不一
劫财：目的性强、能争好抢、投机赌性。负面：见利忘义、官非麻烦。配官杀则贵
食神：乐观豁达、情商高、共情强、表达好、内敛世故。负面：空想少行、情绪化
伤官：思维敏捷、创新开拓、口才强、胆子大。见印才是经世聪明。负面：攻击性强、自我中心
正财：执行力强、诚信务实、坚韧。负面：吝啬算计、缺乏魄力
偏财：慷慨轻财、聪明机灵、投机敢为。负面：虚浮缺节制
正官：自律公正、使命感、建立秩序。负面：刻板僵死、奉承献媚
七杀：果断迅猛、目标导向、豪爽仗义。有制则偏官得用，无制则凶。负面：偏激叛逆、是非不断
正印：聪颖仁慈、喜思善学、知书达理。负面：保守固执、懒惰依赖
偏印：逆向思维、直觉强、才思独特、艺术灵感。负面：孤僻多疑、多思少行

按以下格式输出：
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

SHISHEN_DIZHI: [地支主气十神列表：十神=X 得分=X 状态=X]
SHISHEN_TIANGAN: [有根天干十神列表：十神=X 状态=已显化]

LAYER1_DICSE: [第一层：能量底色格局名]
LAYER2_GONGZUO: [第二层：识别所有做工系统，列出每个系统的名称和构成]
LAYER3_GEJULI: [第三层：格局力度]

GEJUMING_FULL: [完整格局描述，格式：底色格局·做工系统1·做工系统2...]

HE_DETAIL: [天干合详情：哪两干相合，各自十神，复合特质推导]
CHONG_DETAIL: [天干冲详情：主动方/被动方，各自十神，行为表现]`,
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
        system: `你是八字能量报告生成器。根据计算结果生成JSON报告。只输出JSON，第一个字符必须是{。

【renqun规则——严格执行】
已显化非土五行 → "前30%"
已显化土五行 → "前50%"
潜力 → "待激活"
空白 → "缺失"
禁止根据得分高低自行调整

【shishen_list规则】
地支主气十神：defen=实际得分
有根天干透出十神：defen=0，zhuangtai="已显化"，jihuo_type="天干透出"
两者分开列出，不合并

【格局描述规则】
gejuming字段使用完整三层格局描述（GEJUMING_FULL）
例：「建禄格·伤官佩印·杀制群比」

【解读规则】
1. 先点明能量底色（月令格局带来的核心能量场）
2. 重点展开做工系统——这是最有深度的部分
3. 若有伤官佩印：必须点明"见印才是经世聪明，洞察力与创造力并存，发明创造解决问题的奇才"
4. 若有杀制群比：点明"外部压力是激活剂，遇强则强，脉冲式爆发"
5. 最后点出内耗来源
6. 300字，第二人称，有洞察力，让人感觉说的就是我，不罗列，有叙事张力`,
        messages: [{
          role: 'user',
          content: `根据以下计算结果生成JSON：

${calcText}

输出格式：
{
  "rizhu": "",
  "gejuming": "",
  "qudongmoshi": "",
  "gejuli": "",
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
