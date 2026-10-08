import { OutputLanguage, StageCode, WeiboEnglishOption, WeiboPost } from '../types';
import { ChinaCopyFacts, ClarivateImpact, CitedAmount } from './copyFacts';
import { charCount } from './chinaAdLaw';

/** Feed text before Weibo folds the post behind 全文. Hashtags and the link sit outside this. */
export const WEIBO_PRACTICAL_LENGTH = 140;

function impactSentence(impact: ClarivateImpact, language: 'zh' | 'en'): string {
  const year = impact.year ? ` JCR ${impact.year}` : '';
  if (language === 'zh') {
    const which = impact.fiveYear ? '5年影响因子' : '影响因子';
    return `Clarivate${year} ${which} ${impact.value}。`;
  }
  const which = impact.fiveYear ? '5-year impact factor' : 'impact factor';
  return `Clarivate${year} ${which} ${impact.value}.`;
}

function amountSentence(amount: CitedAmount, kind: 'days' | 'apc', language: 'zh' | 'en'): string {
  if (language === 'zh') {
    if (kind === 'days') return `首次决定${amount.value}天（来源：${amount.sourceZh}）。`;
    return `文章处理费${amount.value}美元（来源：${amount.sourceZh}）。`;
  }
  if (kind === 'days') return `First decision ${amount.value} days (source: ${amount.sourceEn}).`;
  return `APC ${amount.value} USD (source: ${amount.sourceEn}).`;
}

function fitSentences(hook: string, sentences: string[], limit: number): string {
  const chosen = sentences.filter(Boolean);
  const lengthWith = (parts: string[]) => charCount(hook) + 1 + charCount(parts.join(''));
  while (chosen.length > 1 && lengthWith(chosen) > limit) chosen.pop();
  if (chosen.length === 1 && lengthWith(chosen) > limit) return '';
  return chosen.join('');
}

function pickHook(options: string[], max = 48): string {
  return options.find((option) => charCount(option) <= max) || options[options.length - 1] || '';
}

function topic(name: string): string {
  const cleaned = name.replace(/[\s#/\\.,，。()（）:：&+]+/g, '');
  if (!cleaned) return '';
  return `#${cleaned}#`;
}

function hashtagsFor(stage: StageCode, facts: ChinaCopyFacts, language: 'zh' | 'en'): string[] {
  const tags = [
    topic(facts.journalName),
    language === 'zh'
      ? stage === 'AWA'
        ? '#学术期刊#'
        : stage === 'CON'
        ? '#选刊参考#'
        : '#投稿须知#'
      : stage === 'AWA'
      ? '#AcademicJournal#'
      : stage === 'CON'
      ? '#JournalFit#'
      : '#AuthorGuidelines#',
  ];
  const publisher = topic(facts.publisher);
  if (publisher && publisher !== tags[0]) tags.push(publisher);
  return Array.from(new Set(tags.filter(Boolean))).slice(0, 3);
}

function chineseCopy(stage: StageCode, facts: ChinaCopyFacts): { hook: string; body: string } {
  const name = facts.journalName;
  const field = facts.disciplineZh ? `研究领域包括${facts.disciplineZh}。` : '';
  const hooks =
    stage === 'AWA'
      ? [`${name}在发表哪些研究？`, '想了解这本期刊的研究范围？']
      : stage === 'CON'
      ? [`${name}适合你的稿件吗？`, '这篇稿件是否适合这本期刊？']
      : [`准备向${name}投稿？`, '投稿前可以先看作者须知。'];
  const hook = pickHook(hooks);
  const longCore =
    stage === 'AWA'
      ? `${name}由${facts.publisher}出版。${field}可以从期刊页面了解研究范围和已发表论文。`
      : stage === 'CON'
      ? `${name}由${facts.publisher}出版。${field}核对收稿范围、文章类型和出版方式。`
      : `${name}由${facts.publisher}出版。${field}作者须知、稿件清单和投稿入口见下方链接。`;
  const shortCore =
    stage === 'AWA'
      ? `了解${name}的研究范围。`
      : stage === 'CON'
      ? `核对${name}的收稿范围。`
      : `查看${name}的作者须知。`;
  const bareCore =
    stage === 'AWA' ? '了解这本期刊的研究范围。' : stage === 'CON' ? '核对这本期刊的收稿范围。' : '查看作者须知和投稿清单。';
  const optional = [
    facts.impact ? impactSentence(facts.impact, 'zh') : '',
    facts.firstDecisionDays ? amountSentence(facts.firstDecisionDays, 'days', 'zh') : '',
    facts.apc ? amountSentence(facts.apc, 'apc', 'zh') : '',
    stage === 'DEC' && facts.firstDecisionDays ? '这是首次决定时间，不是录用时间。' : '',
  ];
  const body =
    fitSentences(hook, [longCore, ...optional], WEIBO_PRACTICAL_LENGTH) ||
    fitSentences(hook, [shortCore, ...optional], WEIBO_PRACTICAL_LENGTH) ||
    fitSentences(hook, [bareCore], WEIBO_PRACTICAL_LENGTH) ||
    bareCore;
  return { hook, body };
}

function englishCopy(stage: StageCode, facts: ChinaCopyFacts, link: string): WeiboEnglishOption {
  const name = facts.journalName;
  const hook = pickHook(
    stage === 'AWA'
      ? [`What does ${name} publish?`, 'What does this journal publish?']
      : stage === 'CON'
      ? [`Does ${name} fit your manuscript?`, 'Does this journal fit your manuscript?']
      : [`Preparing a submission to ${name}?`, 'Preparing a submission?'],
    80
  );
  const longCore =
    stage === 'AWA'
      ? `Published by ${facts.publisher}. See the journal page for scope and published research.`
      : stage === 'CON'
      ? `Published by ${facts.publisher}. Check scope, article types, and publishing options.`
      : `Published by ${facts.publisher}. Author guidelines and the submission checklist are on the page below.`;
  const shortCore =
    stage === 'AWA'
      ? `See what ${name} publishes.`
      : stage === 'CON'
      ? `Check whether ${name} fits.`
      : `Read the ${name} author checklist.`;
  const optional = [
    facts.impact ? impactSentence(facts.impact, 'en') : '',
    facts.firstDecisionDays ? amountSentence(facts.firstDecisionDays, 'days', 'en') : '',
    facts.apc ? amountSentence(facts.apc, 'apc', 'en') : '',
  ];
  const limit = 180;
  const body =
    fitSentences(hook, [longCore, ...optional], limit) ||
    fitSentences(hook, [shortCore], limit) ||
    'See the journal page.';
  return { hook, body, hashtags: hashtagsFor(stage, facts, 'en'), link };
}

export function generateWeiboPost(
  facts: ChinaCopyFacts,
  stage: StageCode,
  outputLanguage: OutputLanguage,
  landingUrl: string
): WeiboPost {
  const { hook, body } = chineseCopy(stage, facts);
  const post: WeiboPost = {
    hook,
    body,
    practicalLength: charCount(hook) + 1 + charCount(body),
    practicalLimit: WEIBO_PRACTICAL_LENGTH,
    hashtags: hashtagsFor(stage, facts, 'zh'),
    link: landingUrl,
    factNotes: facts.factNotes,
  };
  if (outputLanguage === 'all') {
    post.englishOption = englishCopy(stage, facts, landingUrl);
  }
  return post;
}
