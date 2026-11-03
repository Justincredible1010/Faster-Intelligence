/**
 * Japanese (JA) ad copy and the ZH/JA text for sitelinks, callouts and the
 * structured snippet. Ported from AI Studio, with main's rules applied:
 * - metrics appear only when the caller passes a trusted value (jifClaim,
 *   trusted first-decision days); there are no metric fallbacks;
 * - no speed, rank or "world-leading" claims;
 * - sitelink URLs are never built here; the caller maps each link to a
 *   stage-fit URL role, so no path is invented.
 */
import { safeShorten, shortenName, smartClampWithWidth as clamp } from '../utils/textUtils';
import type { StageCode } from '../types';

export type AdLanguage = 'all' | 'EN' | 'ZH' | 'JA';

/** Google Ads sitelink limits (visual width; CJK counts 2). */
export const SITELINK_TEXT_MAX = 25;
export const SITELINK_DESC_MAX = 35;
export const CALLOUT_MAX = 25;
export const MAX_SITELINKS = 4;

export type SitelinkRole = 'about' | 'articles' | 'editors' | 'collections' | 'aims' | 'landing' | 'fees' | 'guidelines' | 'checklist' | 'submission';

interface SitelinkCopy { role: SitelinkRole; text: string; d1: string; d2: string }

const EN_SITELINKS: Record<StageCode, SitelinkCopy[]> = {
  AWA: [
    { role: 'about', text: 'Journal Overview & Scope', d1: 'Explore research fields and mission', d2: 'Who the journal is written for' },
    { role: 'articles', text: 'Browse Latest Articles', d1: 'Read recent peer-reviewed research', d2: 'New papers from the journal' },
    { role: 'editors', text: 'Editorial Leadership', d1: 'Meet the editorial board', d2: 'Editors and their research areas' },
    { role: 'collections', text: 'Research Collections', d1: 'Curated thematic collections', d2: 'Papers grouped by topic' },
  ],
  CON: [
    { role: 'aims', text: 'Aims & Scope Evaluation', d1: 'Check topical alignment and criteria', d2: 'See if your paper fits the scope' },
    { role: 'articles', text: 'Article Types & Formats', d1: 'Accepted research and review types', d2: 'Length and format guidance' },
    { role: 'landing', text: 'Journal Metrics & Indexing', d1: 'Indexing and journal metrics', d2: 'As listed on the journal site' },
    { role: 'fees', text: 'Publishing Options & Fees', d1: 'APC and open access options', d2: 'Funding and waiver information' },
  ],
  DEC: [
    { role: 'guidelines', text: 'Author Guidelines', d1: 'Manuscript preparation and style', d2: 'Formatting and file requirements' },
    { role: 'checklist', text: 'Submission Checklist', d1: 'Required files before submitting', d2: 'Check your manuscript is complete' },
    { role: 'fees', text: 'APC & Waiver Criteria', d1: 'Fee policy and funding guidance', d2: 'Waiver and discount information' },
    { role: 'submission', text: 'Online Submission Portal', d1: 'Submit your paper for peer review', d2: 'Use the official submission system' },
  ],
};

const ZH_SITELINKS: Record<StageCode, SitelinkCopy[]> = {
  AWA: [
    { role: 'about', text: '期刊介绍与范围', d1: '了解研究学科与期刊定位', d2: '面向的读者与学术群体' },
    { role: 'articles', text: '查阅最新论文', d1: '浏览同行评议研究成果', d2: '期刊最新发表文章' },
    { role: 'editors', text: '编委团队', d1: '了解期刊编辑委员会', d2: '编委及其研究方向' },
    { role: 'collections', text: '专题论文集', d1: '按主题整理的论文合集', d2: '浏览相关研究专题' },
  ],
  CON: [
    { role: 'aims', text: '收稿范围核对', d1: '确认稿件主题与期刊定位', d2: '评估论文契合度' },
    { role: 'articles', text: '文章类型与体例', d1: '可接收的论文与综述类型', d2: '查阅篇幅与格式要求' },
    { role: 'landing', text: '期刊指标与收录', d1: '期刊收录与指标信息', d2: '以期刊官网公布为准' },
    { role: 'fees', text: '出版模式与费用', d1: '版面费与开放获取选项', d2: '资助与减免说明' },
  ],
  DEC: [
    { role: 'guidelines', text: '作者投稿指南', d1: '稿件体例与格式说明', d2: '文件准备要求' },
    { role: 'checklist', text: '投稿前自查清单', d1: '核对投稿必备文件', d2: '确认稿件材料完整' },
    { role: 'fees', text: '版面费与减免', d1: '费用政策与资助说明', d2: '减免与优惠信息' },
    { role: 'submission', text: '在线投稿系统', d1: '提交稿件进入同行评议', d2: '通过官方系统投递' },
  ],
};

const JA_SITELINKS: Record<StageCode, SitelinkCopy[]> = {
  AWA: [
    { role: 'about', text: 'ジャーナル概要', d1: '学術ミッションと掲載方針', d2: '対象とする読者と分野' },
    { role: 'articles', text: '最新論文を閲覧', d1: '査読済みの最新論文', d2: 'ジャーナルの新着論文' },
    { role: 'editors', text: '編集委員会', d1: '編集委員と研究分野', d2: '編集体制を確認' },
    { role: 'collections', text: '特集論文集', d1: 'テーマ別の論文コレクション', d2: '関連する研究を探す' },
  ],
  CON: [
    { role: 'aims', text: '掲載方針と領域', d1: '研究テーマの適合性を確認', d2: '投稿対象の分野一覧' },
    { role: 'articles', text: '受付論文形式', d1: '原著論文・総説の受付要項', d2: '長さと形式の目安' },
    { role: 'landing', text: '指標と収載情報', d1: '収載情報と学術指標', d2: 'ジャーナル公式サイトで確認' },
    { role: 'fees', text: '出版費用とOA', d1: 'APCとオープンアクセス', d2: '助成と免除の案内' },
  ],
  DEC: [
    { role: 'guidelines', text: '投稿規程', d1: '原稿執筆要領とフォーマット', d2: '必要なファイルの要件' },
    { role: 'checklist', text: '提出前チェック', d1: '投稿に必要な書類一覧', d2: '原稿の不足を事前に確認' },
    { role: 'fees', text: '出版費用と免除', d1: '費用ポリシーと助成案内', d2: '免除・割引の情報' },
    { role: 'submission', text: 'オンライン投稿', d1: '査読用原稿を提出', d2: '公式投稿システムを利用' },
  ],
};

export interface Sitelink {
  text: string;
  description1: string;
  description2: string;
  finalUrl: string;
  title: string;
  desc: string;
  urlPath: string;
}

/**
 * Stage-fit sitelinks within Google limits. `resolveUrl` maps a role to a URL
 * (main's resolveCampaignUrl), so links only point at pages main already allows.
 * 'all' uses English sitelinks (a single ad group cannot mix languages).
 */
export function buildSitelinks(stage: StageCode, language: AdLanguage, resolveUrl: (role: SitelinkRole) => string): Sitelink[] {
  const table = language === 'ZH' ? ZH_SITELINKS : language === 'JA' ? JA_SITELINKS : EN_SITELINKS;
  return table[stage].slice(0, MAX_SITELINKS).map((s) => {
    const text = clamp(s.text, SITELINK_TEXT_MAX);
    const description1 = clamp(s.d1, SITELINK_DESC_MAX);
    const description2 = clamp(s.d2, SITELINK_DESC_MAX);
    const url = resolveUrl(s.role);
    return { text, description1, description2, finalUrl: url, title: text, desc: description1, urlPath: url };
  });
}

export function localizedSnippetHeader(language: AdLanguage): string {
  return language === 'JA' ? '学術領域' : language === 'ZH' ? '学科方向' : 'Disciplines';
}

/** Google requires at least 3 values per structured snippet; each value is at most 25 width. */
export const SNIPPET_MIN_VALUES = 3;
export const SNIPPET_VALUE_MAX = 25;

const ZH_SNIPPET_TYPES = ['原创研究论文', '综述文章', '同行评议成果', '专题论文集'];
const JA_SNIPPET_TYPES = ['原著論文', '総説', '査読付き論文', '特集論文集'];

/**
 * Structured snippet with >= 3 values, or undefined (omitted) when there are not enough.
 * ZH/JA use Google's "Types" header with localized article types, so no English
 * discipline or publisher text leaks into CJK ads.
 */
export function buildStructuredSnippet(
  facts: { primaryDiscipline?: string | null; publisher?: string | null },
  language: AdLanguage
): { header: string; values: string[] } | undefined {
  let header: string;
  let values: string[];
  if (language === 'ZH') {
    header = '类型';
    values = ZH_SNIPPET_TYPES;
  } else if (language === 'JA') {
    header = '種類';
    values = JA_SNIPPET_TYPES;
  } else {
    header = 'Disciplines';
    values = [
      (facts.primaryDiscipline || '').split('(')[0].trim(),
      facts.publisher || '',
      'Peer-Reviewed Research',
    ];
  }
  const clean = Array.from(new Set(values.map((v) => safeShorten(v, SNIPPET_VALUE_MAX)).filter(Boolean)));
  return clean.length >= SNIPPET_MIN_VALUES ? { header, values: clean } : undefined;
}

export function localizedPeerReviewed(language: AdLanguage): string {
  return language === 'JA' ? '査読付き学術研究' : language === 'ZH' ? '同行评议学术成果' : 'Peer-Reviewed Research';
}

interface TrustedClaims {
  jifClaim: string | null;
  firstDecisionDays: number | null;
  casZone?: string | null;
}

export function localizedCallouts(stage: StageCode, language: 'ZH' | 'JA', facts: { publisher?: string }, claims: TrustedClaims): string[] {
  const days = claims.firstDecisionDays;
  const out =
    language === 'JA'
      ? stage === 'AWA'
        ? [...(facts.publisher ? [`${facts.publisher} 刊行`] : []), '国際的な読者層', '査読付き学術誌', '最新の研究成果']
        : stage === 'CON'
          ? [...(claims.jifClaim ? [claims.jifClaim] : []), '国際ピアレビュー', ...(days ? [`初回判定: 中央値${days}日`] : []), '投稿方針を公開']
          : ['投稿規程を確認', '提出前チェックリスト', ...(days ? [`初回判定: 中央値${days}日`] : []), '公式オンライン投稿']
      : stage === 'AWA'
        ? [...(facts.publisher ? [`${facts.publisher} 出版`] : []), '国际学术读者', '同行评议期刊', '学科前沿成果']
        : stage === 'CON'
          ? [...(claims.jifClaim ? [claims.jifClaim] : []), ...(claims.casZone ? [safeShorten(claims.casZone, 24)] : []), '同行评议标准', ...(days ? [`初审约${days}天`] : []), '出版政策公开']
          : ['作者指南', '投稿材料自查清单', ...(days ? [`初审约${days}天`] : []), '官方投稿通道'];
  return out.map((c) => clamp(c, CALLOUT_MAX)).filter(Boolean).slice(0, 4);
}

interface Seed { text: string; sourceFact: string; language: 'JA'; category: string; positionRecommendation: string }

function h(text: string, sourceFact: string, category: string, positionRecommendation = 'Any Position'): Seed {
  return { text: clamp(text, 30), sourceFact, language: 'JA', category, positionRecommendation };
}

export function japaneseHeadlines(facts: any, stage: StageCode, claims: TrustedClaims) {
  const name = (shortenName(facts.journalName, 18) || facts.journalName);
  const days = claims.firstDecisionDays;
  let list: Seed[];
  if (stage === 'AWA') {
    list = [
      h(`${name} 公式サイト`, facts.journalName, 'Journal Identity', 'Position 1'),
      h('最新の研究成果と論文', facts.primaryDiscipline || 'Scope', 'Scope & Community', 'Position 1'),
      ...(facts.publisher ? [h(`${facts.publisher} 刊行`, facts.publisher, 'Journal Identity', 'Position 1')] : []),
      h('国際ピアレビュー学術誌', 'Peer Review', 'Journal Identity', 'Position 2'),
      h('世界の研究者による知見', 'Community', 'Scope & Community', 'Position 2'),
      h('注目の論文を閲覧', 'Discovery', 'Call to Action', 'Position 2'),
      h('掲載領域と出版趣旨を確認', 'Aims & Scope', 'Call to Action', 'Position 3'),
      h('最新の査読済み論文を読む', 'Readership', 'Call to Action', 'Position 3'),
      h('ジャーナルの詳細はこちら', 'CTA', 'Call to Action'),
      h('国際的な研究コミュニティ', 'Community', 'Scope & Community'),
      h('研究ハイライトを公開中', 'Highlights', 'Scope & Community'),
      h('専門分野の研究を探す', 'Topics', 'Scope & Community'),
      h('学術誌の公式情報を確認', 'Journal Identity', 'Call to Action'),
      h('編集委員会を紹介', 'Editors', 'Journal Identity'),
      h('特集論文コレクション', 'Collections', 'Scope & Community'),
      h('最新号をオンラインで読む', 'Latest Issue', 'Call to Action'),
    ];
  } else if (stage === 'CON') {
    list = [
      h(`${name} 投稿基準と掲載方針`, 'Scope Check', 'Scope & Community', 'Position 1'),
      ...(claims.jifClaim ? [h(claims.jifClaim, claims.jifClaim, 'Evaluation & Metrics', 'Position 1')] : []),
      h('研究テーマの適合性を確認', 'Fit Evaluation', 'Scope & Community', 'Position 1'),
      ...(days ? [h(`初回判定まで中央値${days}日`, `${days}日`, 'Evaluation & Metrics', 'Position 2')] : []),
      h('国際ピアレビューを実施', 'Editorial Standards', 'Evaluation & Metrics', 'Position 2'),
      h('同分野ジャーナルと比較', 'Comparison Evaluation', 'Evaluation & Metrics', 'Position 2'),
      h('収載情報を確認', 'Indexing', 'Evaluation & Metrics', 'Position 3'),
      h('出版費用とOA情報', 'Publishing Options', 'Publishing Options', 'Position 3'),
      h('受付可能な論文形式一覧', 'Article Formats', 'Scope & Community', 'Position 3'),
      h('投稿前の適合性チェック', 'Fit CTA', 'Call to Action'),
      h('編集方針と審査プロセス', 'Editorial Policy', 'Evaluation & Metrics'),
      h('著者向け投稿要件を確認', 'Author Guidance', 'Call to Action'),
      h('掲載領域を詳しく確認', 'Aims & Scope', 'Scope & Community'),
      h('査読の流れを確認', 'Peer Review', 'Evaluation & Metrics'),
      h('投稿方針を読む', 'Policies', 'Call to Action'),
      h('論文の適合性を事前に確認', 'Fit Evaluation', 'Scope & Community'),
      h('出版モデルを比較', 'Publishing Options', 'Publishing Options'),
      h('掲載論文の傾向を確認', 'Articles', 'Scope & Community'),
    ];
  } else {
    list = [
      h(`${name} 論文オンライン投稿`, 'Submission Portal', 'Author Guidance', 'Position 1'),
      h('投稿規程と提出チェックリスト', 'Author Guidelines', 'Author Guidance', 'Position 1'),
      h('公式オンライン投稿窓口', 'Portal', 'Author Guidance', 'Position 1'),
      h('原稿執筆要領とフォーマット', 'Preparation', 'Author Guidance', 'Position 2'),
      h('提出前セルフチェック', 'Checklist', 'Author Guidance', 'Position 2'),
      ...(days ? [h(`初回判定まで中央値${days}日`, `${days}日`, 'Author Guidance', 'Position 3')] : []),
      h('投稿後の流れを確認', 'Peer Review Workflow', 'Author Guidance', 'Position 3'),
      h('原稿提出を開始', 'CTA', 'Call to Action'),
      h('公式投稿システムはこちら', 'Portal', 'Author Guidance'),
      h('投稿ガイドを確認', 'Guide', 'Call to Action'),
      h('出版費用と助成制度', 'Fees', 'Author Guidance'),
      h('必要書類を確認', 'Checklist', 'Author Guidance'),
      h('投稿準備をステップ毎に案内', 'Steps', 'Author Guidance'),
      h('論文原稿の提出はこちら', 'CTA', 'Call to Action'),
      h('査読プロセスの案内', 'Peer Review', 'Author Guidance'),
      h('原稿フォーマットを確認', 'Formatting', 'Author Guidance'),
      h('投稿前の最終確認', 'Checklist', 'Call to Action'),
    ];
  }
  return list.slice(0, 15).map((x) => ({ ...x, charCount: x.text.length }));
}

export function japaneseDescriptions(facts: any, stage: StageCode, claims: TrustedClaims) {
  const d = (text: string, sourceFact: string, theme: string) => ({ text: clamp(text, 90), sourceFact, language: 'JA' as const, theme });
  const pub = facts.publisher ? `${facts.publisher}が刊行する` : '';
  const list =
    stage === 'AWA'
      ? [
          d(`${facts.journalName}の最新論文を閲覧。掲載領域と研究テーマを確認できます。`, 'Journal Overview', 'Scope & Relevance'),
          d(`${pub}査読付き学術誌。各分野の研究成果をオンラインで公開しています。`, facts.publisher || 'Journal', 'Scope & Relevance'),
          d('国際的な研究コミュニティに向けた査読済み論文。最新号をオンラインで閲覧。', 'Community Readership', 'Scope & Relevance'),
          d('ジャーナルの掲載対象領域、出版方針、注目論文をチェック。', 'Discovery CTA', 'Scope & Relevance'),
        ]
      : stage === 'CON'
        ? [
            d(`${facts.journalName}への投稿を検討中の方へ。${claims.jifClaim ? `${claims.jifClaim}。` : ''}掲載方針を確認。`, claims.jifClaim || 'Evaluation', 'Evaluation & Peer Review'),
            d(`${claims.firstDecisionDays ? `初回判定まで中央値${claims.firstDecisionDays}日。` : ''}投稿前に研究テーマの適合性をご確認ください。`, claims.firstDecisionDays ? `${claims.firstDecisionDays}日` : 'Scope Check', 'Evaluation & Peer Review'),
            d('受付可能な原稿形式、出版モデル、査読プロセスを確認して投稿先を選択。', 'Publishing Options', 'Publishing Options'),
            d('同分野のジャーナルと掲載方針や出版モデルを比較して検討できます。', 'Comparison Evaluation', 'Comparison & Fit'),
          ]
        : [
            d(`${facts.journalName}の投稿規程と提出チェックリストを確認して投稿準備を。`, 'Author Guidelines', 'Author Checklist'),
            d('論文フォーマット、執筆要領、必要書類を確認して提出準備を開始。', 'Manuscript Prep', 'Author Checklist'),
            d('公式投稿システムから原稿を提出。投稿後の流れも事前に確認できます。', 'Submission Portal', 'Publishing Options'),
            d('出版倫理の方針を確認のうえ、査読用原稿の提出はこちらから。', 'Peer Review Workflow', 'Evaluation & Peer Review'),
          ];
  return list.map((x) => ({ ...x, charCount: x.text.length }));
}

export function japaneseKeywords(facts: any, stage: StageCode) {
  const name = facts.journalName;
  const disc = (facts.primaryDiscipline || '').split('(')[0].trim();
  const P = 'フレーズ一致 (Phrase)' as const;
  const E = '完全一致 (Exact)' as const;
  const kw =
    stage === 'AWA'
      ? [
          { keywordJa: `${name} 最新論文`, matchType: P, intentJa: '論文閲覧・学術動向' },
          ...(disc ? [{ keywordJa: `${disc} 学術雑誌`, matchType: P, intentJa: '分野別の研究' }] : []),
          ...(facts.publisher ? [{ keywordJa: `${facts.publisher} 学術誌`, matchType: P, intentJa: '出版元・ジャーナル発見' }] : []),
          { keywordJa: `[${name.toLowerCase()} 論文一覧]`, matchType: E, intentJa: 'ジャーナル直接検索' },
        ]
      : stage === 'CON'
        ? [
            { keywordJa: `[${name} インパクトファクター]`, matchType: E, intentJa: '学術指標の確認' },
            { keywordJa: `"${name} 投稿規程"`, matchType: P, intentJa: '原稿適合性確認' },
            { keywordJa: `"${name} 査読期間"`, matchType: P, intentJa: 'ジャーナル比較・選定' },
            { keywordJa: `[${name} 査読プロセス]`, matchType: E, intentJa: 'ピアレビュー基準' },
          ]
        : [
            { keywordJa: `[${name} 論文投稿]`, matchType: E, intentJa: 'オンライン原稿提出' },
            { keywordJa: `"${name} 執筆要領"`, matchType: P, intentJa: '投稿前フォーマット準備' },
            { keywordJa: `"${name} オンライン投稿システム"`, matchType: P, intentJa: '査読用原稿受付窓口' },
            { keywordJa: `[${name} 投稿チェックリスト]`, matchType: E, intentJa: '提出前最終確認' },
          ];
  return {
    englishSearchKeywords: [],
    chineseAuthorKeywords: [],
    japaneseAuthorKeywords: kw,
    negativeKeywords: ['論文代行', '卒論代行', 'レポート代行', '論文売買', '査読偽装', 'ハゲタカジャーナル', '掲載保証'],
  };
}

export function japaneseDisplayAd(facts: any, stage: StageCode, claims: TrustedClaims) {
  const name = (shortenName(facts.journalName, 18) || facts.journalName);
  const business = facts.publisher || facts.journalName;
  const common = { shortHeadlineCharCount: 0, longHeadlineCharCount: 0, descriptionCharCount: 0, businessName: business };
  if (stage === 'AWA') {
    return {
      ...common,
      shortHeadline: clamp(`${name}の最新研究`, 30),
      longHeadline: clamp(`${facts.journalName} · 最新の査読済み論文を閲覧`, 90),
      description: clamp('掲載領域の研究成果と注目論文をお届けします。最新号を閲覧。', 90),
      ctaText: '最新論文を閲覧',
      visualConceptPrompt: 'An academic research banner focusing on scientific discovery, subtle journal cover, clean publisher branding. Low text density.',
      imageAccentColor: '#002d62',
      targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'sciencedirect.com', 'nature.com'],
      bannerHeadlineZh: `${facts.journalName} 最新論文を閲覧`,
      bannerSubtextZh: facts.publisher ? `${facts.publisher} 刊行 · 査読付き論文` : '査読付き論文',
    };
  }
  if (stage === 'CON') {
    return {
      ...common,
      shortHeadline: clamp(`${name} 投稿基準`, 30),
      longHeadline: clamp(`${facts.journalName}への投稿を検討${claims.jifClaim ? `: ${claims.jifClaim}` : ''}`, 90),
      description: clamp('掲載方針、査読プロセス、原稿形式を確認して投稿先を選択。', 90),
      ctaText: '投稿規程を確認',
      visualConceptPrompt: 'An objective academic evaluation ad featuring the official journal cover and a professional scholarly palette. Do not draw impact-factor, quartile, or Clarivate badges.',
      imageAccentColor: '#1e1b4b',
      targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'scholar.google.com', 'nature.com'],
      bannerHeadlineZh: `${facts.journalName} 投稿検討ガイド`,
      bannerSubtextZh: '掲載方針と査読プロセスを確認',
    };
  }
  return {
    ...common,
    shortHeadline: clamp(`${name} オンライン投稿`, 30),
    longHeadline: clamp(`${facts.journalName} 投稿規程と公式オンライン投稿`, 90),
    description: clamp('投稿規程とチェックリストを確認し、公式システムから原稿を提出。', 90),
    ctaText: '投稿規程を見る',
    visualConceptPrompt: 'A streamlined author guidance banner showcasing a manuscript submission checklist icon and clear typography.',
    imageAccentColor: '#064e3b',
    targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'nature.com', 'link.springer.com'],
    bannerHeadlineZh: `${facts.journalName} 原稿オンライン受付`,
    bannerSubtextZh: '投稿規程と提出チェックリスト',
  };
}
