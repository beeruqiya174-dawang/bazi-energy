'use strict';

/**
 * /api/analyze — 能量图谱分析接口（V6 架构）
 *
 * 架构（去 Claude 化、可控）：
 *   1. 计算层：lib/bazi.js 纯代码引擎（确定性规则，毫秒级，零成本，永不失败）
 *   2. 叙事层：把结构化结果写成 300 字解读 —— OpenAI 兼容接口，供应商可切换
 *      （DeepSeek / 通义千问 / GLM / Kimi / Anthropic 均支持，按可用 key 顺序自动故障切换）
 *   3. 兜底：所有叙事供应商失败时，用确定性模板生成解读，产品永不白屏
 *
 * 环境变量（在 Vercel 项目 Settings → Environment Variables 配置，只需配你有的）：
 *   DEEPSEEK_API_KEY     DeepSeek（https://platform.deepseek.com）
 *   DASHSCOPE_API_KEY    通义千问（https://dashscope.console.aliyun.com）
 *   ZHIPU_API_KEY        智谱 GLM（https://open.bigmodel.cn）
 *   MOONSHOT_API_KEY     Kimi（https://platform.moonshot.cn）
 *   ANTHROPIC_API_KEY    Anthropic（可选回退）
 *   NARRATIVE_PROVIDER   强制指定首选供应商（deepseek/qwen/zhipu/moonshot/anthropic）
 */

const BaziEngine = require('../lib/bazi.js');

// ── 叙事供应商注册表（全部 OpenAI 兼容 chat/completions）──
const PROVIDERS = {
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    keyEnv: 'DEEPSEEK_API_KEY'
  },
  qwen: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
    keyEnv: 'DASHSCOPE_API_KEY'
  },
  zhipu: {
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash',
    keyEnv: 'ZHIPU_API_KEY'
  },
  moonshot: {
    url: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'moonshot-v1-8k',
    keyEnv: 'MOONSHOT_API_KEY'
  }
};

const NARRATIVE_SYSTEM = `你是能量图谱的解读撰写者。你会收到一份已由确定性引擎算好的八字分析 JSON，你的唯一任务：把它写成一段约300字的解读文字。

规则：
- 第二人称「你」，有洞察力，让人感觉「说的就是我」，不能是星座式泛泛而谈
- 结构：先讲能量如何运转（生克主线），再讲做工系统如何激活实际能力，最后点出内耗来源
- 不罗列数据，不出现百分比数字，要有叙事张力，避免「你是一个……的人」句式
- 若存在伤官佩印：必须点明「见印才是经世聪明，洞察力与创造力并存，发明创造解决问题的奇才」
- 若存在杀制群比：必须点明「外部压力是激活剂，遇强则强，脉冲式爆发」
- 若存在官印相生或财官印顺生：结合日主强弱——有根则点明「身根稳固，受生有力」；无根则点明身弱隐忧与补根方向
- 五行能量含地支藏干补充分（中气×0.3、余气×0.15）：如戌藏丁火——火有初始能量但弱于主气，解读时可点明「藏而不透，能量有但待显化」
- 若 zhuanhua_cengci.shi_guishu 为 true：食伤能量按做工归属顺生入财路（食伤生财）或贵路（食神制杀），世俗占比已含此归入——点明「输出顺生变现/驯压成贵，能量转化效率高」
- 若 genqi_cengci 为有气无根（承重系数0.5）或无根无气（承重系数0）：必须点明「日主担不起财官」，格局再好也要按系数打折；有根则可点明身能任财官
- 若 genqi_cengci.congge 为 true（无根无气 但 财官通道已开 且 转化功率≥0.5）：必须点明这是从格——按 congge_ming 区分从财官/从杀/从财，弃命相从、不担而顺，从得真者反主大富大贵的极少数
- 只输出解读正文，不加标题、不加引号、不换行、不加任何格式符号`;

function buildUserPrompt(result) {
  const slim = {
    rizhu: result.rizhu,
    rizhu_qiangruo: result.rizhu_qiangruo,
    geju: result.wanzheng_geju,
    gejuli: result.gejuli,
    xiduyou: result.xiduyou,
    wuxing: result.wuxing,
    canggan_nengliang: result.canggan_mingxi.filter(c => c.defen > 0).map(c => ({
      weizhi: `${c.zhu}${c.dizhi}藏${c.canggan}（${c.weizhi}）`, wuxing: c.wuxing, defen: c.defen
    })),
    shishen: result.shishen_list.map(s => ({
      shishen: s.shishen, laiyuan: s.laiyuan, defen: s.defen,
      zhuangtai: s.zhuangtai, renqun: s.renqun
    })),
    nengliang_liyong: result.nengliang_liyong,
    zhuanhua_nengliang: result.zhuanhua_nengliang,
    zhuanhua_xiaolv: result.zhuanhua_xiaolv,
    zhuanhua_cengci: result.zhuanhua_cengci,
    genqi_cengci: result.genqi_cengci,
    neihao: result.neihao,
    kongbai: result.kongbai,
    shengke_zhuxian: result.shengke_zhuxian,
    xitong_list: result.xitong_list,
    gongzuo: result.gongzuo
  };
  return `八字分析结果JSON：\n${JSON.stringify(slim, null, 1)}\n\n请写出jieda解读文字。`;
}

async function callOpenAICompatible(provider, apiKey, userPrompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(provider.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.7,
        max_tokens: 800,
        messages: [
          { role: 'system', content: NARRATIVE_SYSTEM },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      throw new Error(errBody || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text.trim()) throw new Error('空响应');
    return text.trim().replace(/^["「『]|["」』]$/g, '');
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic(apiKey, userPrompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: NARRATIVE_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      throw new Error(errBody || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const text = (data?.content || []).map(c => c.text || '').join('');
    if (!text.trim()) throw new Error('空响应');
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

// ── 兜底：确定性模板解读（零 LLM，永不失败）──
function templateJieda(r) {
  const parts = [];
  const dm = { 输出型: '你的能量以输出见长，表达与创造是最自然的通道。',
    掌控型: '你的能量以掌控见长，目标与秩序驱动你前行。',
    内核型: '你的能量向内沉淀，靠体系与认知积累立足。' };
  parts.push(`你的命盘以${r.gejuming}为底色，${r.gejuli}月令坐镇，${dm[r.qudongmoshi] || ''}`);

  if (r.shengke_zhuxian.length) {
    parts.push(`能量沿${r.shengke_zhuxian.join('、')}的主线流转，各环节互为滋养。`);
  }
  for (const sys of r.xitong_list) {
    if (sys === '伤官佩印') parts.push('伤官与印星联动，见印才是经世聪明——洞察力与创造力并存，是发明创造、解决问题的奇才。');
    else if (sys === '杀制群比') parts.push('七杀冲击比劫，外部压力是你的激活剂，遇强则强，呈脉冲式爆发。');
    else if (sys === '财官印顺生') parts.push('财官印三者顺生，资源、地位与智慧形成良性循环，是难得的高配置。');
    else if (sys === '官印相生') parts.push('官印相生，自律与学识互相成就，文贵之象。');
    else if (sys === '食神制杀') parts.push('食神制杀，以技术与果敢驯服压力，适合硬核专业路线。');
    else if (sys === '财生官') parts.push('财星滋生官星，资源在向地位与影响力转化。');
    else if (sys === '伤官生财') parts.push('伤官生财，爆发力极强的输出直接变现。');
    else if (sys === '食神生财') parts.push('食神生财，才华平稳输出、持续变现。');
    else if (sys === '财印双清') parts.push('财印双清，资源与智慧并行不悖。');
  }
  const nh = r.neihao;
  parts.push(`不过，你的能量利用率约${Math.round(r.nengliang_liyong * 100)}%，属于${nh.dengji}——${nh.yuanyin}。${nh.dengji === '低内耗' ? '损耗很小，几乎全力以赴。' : '识别这个来源，是提效的第一步。'}`);
  // 转化层次（世俗标准）
  const cc = r.zhuanhua_cengci;
  if (cc) {
    const ccText = {
      '财官双全': '已转化的能量中财官两路皆通——利禄与功名双通道，世俗成就的配置最全。',
      '官贵之途': '已转化的能量走的是官杀一路——功名、权位与责任感是能量变现的主通道。',
      '财富之路': '已转化的能量走的是财路——务实积累与资源变现是主通道。',
      '内在通达': '已转化的能量全部流向内在通道（才学、表达与同侪）——成就在己不在势位，世俗功名需要额外搭桥。',
      '能量未转化': '能量尚未进入任何做工通道，先解决"有没有通道"的问题。'
    };
    parts.push(ccText[cc.cengci] || '');
    if (cc.cengci !== '能量未转化' && cc.cengci !== '财官双全') {
      parts.push(`世俗通道能量占已转化的${Math.round((cc.shisu_zhanbi || 0) * 100)}%。`);
    }
    // 食伤顺生归入世俗通道（做工归属原则）
    if (cc.shi_guishu) {
      if (r.xitong_list.includes('伤官生财') || r.xitong_list.includes('食神生财')) {
        parts.push('食伤能量顺生入财路——输出直接变现，有食伤顺生，能量转化效率高。');
      } else {
        parts.push('食伤能量经食神制杀归入贵路——以输出驯服压力，化为功名，能量转化效率高。');
      }
    }
  }
  // 根气层次（担财官的承重系数，直接乘在转化功率上）
  const gc = r.genqi_cengci;
  if (gc) {
    if (gc.congge) {
      const cgText = {
        '从财官': '日主无根无气而财官两路皆通且能量充实——弃命从财官的从格：不担而顺，随财官之势而行。古籍所谓「从得真者大富贵」正是此局。',
        '从杀': '日主无根无气而官杀成势且能量充实——弃命从杀的从格：舍身入局，借权势之势而行，从得真者反主贵。',
        '从财': '日主无根无气而财星成势且能量充实——弃命从财的从格：舍身逐财，随财富之势而行，从得真者反主富。'
      };
      parts.push(cgText[gc.congge_ming] || cgText['从财官']);
      parts.push('全枚举518,400盘中仅约0.2%的极少数配置（从财官/从杀/从财合计1,194盘），且以通道能量≥0.5为「从得真」的门槛——从得不真者不算从。');
    } else {
      const gcText = {
        '有根': gc.qiang_gen >= 2 ? '日主在地支根深（承重系数1）——财官再旺也担得起，格局的承重墙足够厚。' : '日主在地支有根（承重系数1）——财官之任可以承担，根基不算虚浮。',
        '有气无根': '日主无根但有印星生扶之气（承重系数0.5）——以身代根，能担但担得辛苦，转化功率按半计入有效功率。',
        '无根无气': '日主无根无气（承重系数0）——担不起财官：能量转化得再漂亮，有效功率也归零，成就的形态会偏向借力与依附。'
      };
      parts.push(gcText[gc.genqi] || '');
      if (gc.genqi !== '有根' && cc && cc.cengci_fen >= 2) {
        parts.push('格局与根基的落差是这个盘面最需要注意的短板。');
      }
    }
  }
  if (r.kongbai.length) parts.push(`${r.kongbai.join('、')}在你的盘面中缺失，这个维度需要借助外部补足。`);
  if (r.rizhu_qiangruo === '身弱') parts.push('日主根气偏弱，纵有好局也需先稳住自身，补根是长期功课。');
  return parts.filter(Boolean).join('');
}

// ── 主入口（CommonJS：Vercel 与本地 Node 均可直接运行）──
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (e) { body = {}; }

  const baziInput = body.bazi || '';

  // 1. 计算层：纯代码引擎（永不失败、毫秒级）
  let engineOut;
  try {
    engineOut = BaziEngine.analyze(baziInput);
  } catch (e) {
    res.status(400).json({
      error: e.message || '八字输入无效',
      hint: '格式示例：年柱甲寅 月柱己巳 日柱丙子 时柱壬辰'
    });
    return;
  }

  const { calc, result } = engineOut;

  // 2. 叙事层：按顺序尝试可用供应商
  const order = [];
  const preferred = process.env.NARRATIVE_PROVIDER;
  if (preferred && PROVIDERS[preferred]) order.push(preferred);
  for (const name of Object.keys(PROVIDERS)) if (!order.includes(name)) order.push(name);

  let jieda = '';
  let providerUsed = 'template';
  const attempts = [];

  for (const name of order) {
    const key = process.env[PROVIDERS[name].keyEnv];
    if (!key) continue;
    try {
      jieda = await callOpenAICompatible(PROVIDERS[name], key, buildUserPrompt(result));
      providerUsed = name;
      break;
    } catch (e) {
      attempts.push(`${name}: ${String(e.message).slice(0, 120)}`);
    }
  }
  // Anthropic 可选回退
  if (!jieda && process.env.ANTHROPIC_API_KEY) {
    try {
      jieda = await callAnthropic(process.env.ANTHROPIC_API_KEY, buildUserPrompt(result));
      providerUsed = 'anthropic';
    } catch (e) {
      attempts.push(`anthropic: ${String(e.message).slice(0, 120)}`);
    }
  }

  // 3. 兜底模板（无任何 key 或全部失败）
  if (!jieda) {
    jieda = templateJieda(result);
    providerUsed = 'template';
  }

  result.jieda = jieda.replace(/["\n\r]/g, '');

  res.status(200).json({
    calc,
    result,
    meta: {
      engine: 'bazi-engine-v6-deterministic',
      narrative_provider: providerUsed,
      narrative_fallbacks: attempts,
      duration_ms: Date.now() - (req.startTime || 0)
    }
  });
}

module.exports = handler;
module.exports.default = handler;
