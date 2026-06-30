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
        system: `你是八字能量计算引擎。严格按步骤计算，禁止使用规则集以外的任何概念。

【基础对照表】
天干五行阴阳：甲=阳木 乙=阴木 丙=阳火 丁=阴火 戊=阳土 己=阴土 庚=阳金 辛=阴金 壬=阳水 癸=阴水

地支主气：子=壬水 丑=己土 寅=甲木 卯=乙木 辰=戊土 巳=丙火 午=丁火 未=己土 申=庚金 酉=辛金 戌=戊土 亥=壬水

【地支藏干完整表（用于判断天干是否有根）】
子：壬水
丑：己土、癸水、辛金
寅：甲木、丙火、戊土
卯：乙木
辰：戊土、乙木、癸水
巳：丙火、庚金、戊土
午：丁火、己土
未：己土、丁火、乙木
申：庚金、壬水、戊土
酉：辛金
戌：戊土、辛金、丁火
亥：壬水、甲木

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
天干系数判断（只看五行不分阴阳，甲乙同木 丙丁同火 戊己同土 庚辛同金 壬癸同水）：
  - 全盘任意地支（主气或藏干）含同五行 → 1.0
  - 同柱地支（主气或藏干）生该天干五行 → 0.6
  - 以上都不满足 → 0.3
日主天干也算透干
地支得分 = 权重 × 衰减系数 × 天干系数
能量利用率 = 四地支得分之和
内耗 = 1.0 - 利用率

【重要：天干有根判断升级】
判断天干是否有根，必须查全盘所有地支的藏干表，不只看主气。
例：壬水透干，全盘地支有申，申藏壬水 → 壬水有根，天干系数=1.0
例：戊土透干，全盘地支有寅，寅藏戊土 → 戊土有根，天干系数=1.0
例：丙火透干，全盘地支有巳，巳藏丙火 → 丙火有根，天干系数=1.0

【地支状态判断】
已显化：该地支主气五行有天干透出（含日主），且该天干有根（全盘地支主气或藏干含同五行）
潜力：该地支主气五行无天干透出
空白：某五行既无天干也无地支（主气或藏干均无）

【生克主线识别（做工系统第一层）】
识别命盘中存在的能量流转路径：
财生官：财星天干透出且有根 + 官星天干透出且有根 → 财滋官，官格有力
官生印：官星天干透出且有根 + 印星天干透出且有根 → 官印相生
财官印顺生：三者同时成立 → 最高格局配置
食伤生财：食神/伤官天干透出且有根 + 财星透出有根 → 输出变现
杀印相生：七杀透出有根 + 印星透出有根 → 化杀为用
食神制杀：食神透出有根 + 七杀透出有根 → 技术制压

【天干合冲（做工系统第二层，影响生克路径效率）】
天干五合（合激活·持续稳定）：甲己 乙庚 丙辛 丁壬 戊癸
天干六冲（冲激活·脉冲爆发）：甲庚 乙辛 丙壬 丁癸

合：将两个能量绑定，持续联动，改变各自流向，效果稳定持续
冲：强方激活弱方，脉冲式改变流向，遇强则强

【格局三层结构】
第一层：月令主气对日主的十神 → 底色格局名
格局名只能用：正官格 七杀格 正印格 偏印格 食神格 伤官格 正财格 偏财格 建禄格 月劫格

第二层：做工系统
先识别生克主线（财生官、官生印等），再识别合冲对主线的影响
做工系统名只能用：
官印相生 财生官 财官印顺生 伤官佩印 食神制杀 杀印相生 食伤生财 伤官生财 杀制群比
对应不上以上名称则不写做工系统

第三层：格局力度
大格：月令得分≥0.35 / 中格：0.20-0.34 / 弱格：<0.20

【格局稀有度（基于格局完整度）】
无做工系统 → 约20%基础格局
1套做工系统 → 约3%-5%稀有格局
2套做工系统 → 约1%极稀有格局
大格+2套及以上 → 人群前0.1%千里挑一格局

【十神心性（解读素材）】
比肩：义气自信、能扛事、善竞争。负面：盲目自大
劫财：目的性强、投机赌性。配官杀则贵。负面：见利忘义
食神：乐观豁达、情商高、共情强。负面：空想少行
伤官：思维敏捷、创新开拓。见印才是经世聪明。负面：攻击性强
正财：执行力强、诚信务实。负面：吝啬算计
偏财：慷慨轻财、投机敢为。负面：虚浮缺节制
正官：自律公正、使命感。负面：刻板僵死
七杀：果断迅猛、目标导向。有制则得用。负面：偏激叛逆
正印：聪颖仁慈、喜思善学。负面：保守固执
偏印：逆向思维、直觉强、才思独特。负面：孤僻多疑

输出格式：
RIZHU: [日主/五行阴阳]
YUELING_DIZHI: [月令地支/主气五行]
YUELING_SHISHEN: [月令主气对日主十神]
SHUAIJIAN: 火=X 土=X 木=X 水=X 金=X

NIANZHI: [地支] 主气=[X] 藏干=[X] 权重=0.10 衰减=[X] 天干=[X] 天干有根=[是/否，说明依据] 天干系数=[X] 得分=[X]
YUEZHI: [地支] 主气=[X] 藏干=[X] 权重=0.45 衰减=[X] 天干=[X] 天干有根=[是/否，说明依据] 天干系数=[X] 得分=[X]
RIZHI: [地支] 主气=[X] 藏干=[X] 权重=0.15 衰减=[X] 天干=[日主X] 天干有根=[是] 天干系数=[X] 得分=[X]
SHIZHI: [地支] 主气=[X] 藏干=[X] 权重=0.30 衰减=[X] 天干=[X] 天干有根=[是/否，说明依据] 天干系数=[X] 得分=[X]

WUXING_TOTAL: 火=X 土=X 木=X 水=X 金=X
NENGLIANG_LIYONG: [合计]
NEIHAO: [1.0-合计]

SHISHEN_DIZHI: [地支主气十神列表：十神=X 得分=X 状态=X]
SHISHEN_TIANGAN: [有根天干十神列表：十神=X 状态=已显化]

SHENGKE_MAIN: [识别生克主线流转路径，如：财（戊）生官（庚）→ 官（庚）生印（壬）→ 财官印顺生成立]
HECHONG: [天干合冲情况及对主线的影响]

LAYER1: [底色格局名]
LAYER2: [做工系统，对应不上白名单则写：无做工系统]
LAYER3: [格局力度]
GEJUMING_FULL: [完整格局]
XIYOUDU: [稀有度]`,
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
        system: `你是八字能量报告生成器。根据计算结果生成JSON。只输出JSON，第一个字符必须是{。

【严格规则】
1. gejuming使用GEJUMING_FULL完整格局描述
2. xiyoudu使用XIYOUDU稀有度描述
3. renqun：已显化非土=前30% 已显化土=前50% 潜力=待激活 禁止自行调整
4. shishen_list：地支主气十神（defen=实际得分）和有根天干透出十神（defen=0）分开列出
5. jieda禁止出现引号或特殊字符，只用普通文字
6. 解读重点：先讲生克主线（能量如何流转），再讲合冲影响，最后讲内耗
7. 若有伤官必须点明：见印才是经世聪明
8. 若有官印相生/财官印顺生：点明文贵之象，权力与资源兼备`,
        messages: [{
          role: 'user',
          content: `根据以下计算结果生成JSON报告：

${calcText}

输出格式：
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
