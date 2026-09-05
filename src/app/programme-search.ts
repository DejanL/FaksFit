import type {
  Institution,
  ProgrammePerformerSearchRegistry,
  ProgrammePerformerSearchTeacher,
  Registry,
  SearchPerformerMatch,
  SearchResult,
  StudyProgramme,
} from './models';

type MatchKind = 'exact' | 'prefix' | 'fuzzy';

interface SearchField {
  label: string;
  normalized: string;
  tokens: string[];
  weight: number;
  allowFuzzy: boolean;
  maximumFuzzyDistance?: number;
  groupId?: string;
  performer?: SearchPerformerMatch;
}

interface TermMatch {
  field: SearchField;
  kind: MatchKind;
  score: number;
}

export interface ProgrammeSearchDocument {
  result: SearchResult;
  fields: SearchField[];
}

export function buildProgrammeSearchIndex(
  registry: Registry,
  performerRegistry?: ProgrammePerformerSearchRegistry | null,
): ProgrammeSearchDocument[] {
  const institutions = new Map<string, Institution>(
    registry.institutions.map((institution) => [institution.id, institution]),
  );

  return registry.study_programmes.map((programme) => {
    const institution = institutions.get(programme.institution_id);
    const university = programme.university_id
      ? institutions.get(programme.university_id)
      : undefined;

    return {
      result: { item: programme, institution, university },
      fields: [
        ...buildSearchFields(programme, institution, university),
        ...buildPerformerSearchFields(
          performerRegistry?.programmes[programme.id] ?? [],
        ),
      ],
    };
  });
}

export function searchProgrammeIndex(
  documents: ProgrammeSearchDocument[],
  query: string,
): SearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = uniqueTokens(tokenize(normalizedQuery));
  if (!normalizedQuery) {
    return documents.map((document) => document.result);
  }
  if (queryTokens.length === 0) return [];

  const hits: SearchResult[] = [];

  for (const document of documents) {
    const termMatches: TermMatch[] = [];

    for (const queryToken of queryTokens) {
      const match = bestTermMatch(queryToken, document.fields);
      if (!match) {
        termMatches.length = 0;
        break;
      }
      termMatches.push(match);
    }

    if (termMatches.length !== queryTokens.length) continue;

    const phraseBonus = bestPhraseBonus(normalizedQuery, document.fields);
    const allExactBonus = termMatches.every((match) => match.kind === 'exact') ? 15 : 0;
    const performerGroupMatches = bestPerformerGroupMatches(
      queryTokens,
      document.fields,
    );
    const hasPerformerRelationship = queryTokens.length > 1
      && performerGroupMatches.length > 0;
    const relationshipBonus = hasPerformerRelationship
      ? 30
      : 0;
    const reasons = [...new Set(termMatches
      .sort((a, b) => b.score - a.score)
      .map((match) => match.field.label))]
      .slice(0, 2);

    hits.push({
      ...document.result,
      match: {
        score: termMatches.reduce((total, match) => total + match.score, 0)
          + phraseBonus
          + allExactBonus
          + relationshipBonus,
        reasons,
        fuzzy: termMatches.some((match) => match.kind === 'fuzzy'),
        performers: hasPerformerRelationship
          ? performerGroupMatches.map((match) => match.performer)
          : uniquePerformerMatches(termMatches),
      },
    });
  }

  return hits.sort((a, b) =>
    (b.match?.score ?? 0) - (a.match?.score ?? 0)
    || a.item.name.localeCompare(b.item.name, 'sl'),
  );
}

export function matchesTokenizedQuery(values: Array<string | null>, query: string): boolean {
  const queryTokens = uniqueTokens(tokenize(normalizeSearchText(query)));
  if (queryTokens.length === 0) return true;

  const fields = values
    .map((value) => field('zapisu', value, 1))
    .filter((searchField): searchField is SearchField => searchField !== null);

  return queryTokens.every((queryToken) => bestTermMatch(queryToken, fields) !== null);
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sl')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildSearchFields(
  programme: StudyProgramme,
  institution?: Institution,
  university?: Institution,
): SearchField[] {
  return [
    field('eVŠ kodi', programme.evs_code, 100, false),
    field('imenu programa', programme.name, 40),
    field('angleškem imenu programa', programme.name_en, 28),
    field('kratici fakultete', institution?.abbreviation, 35, false),
    field('kratici zavoda', university?.abbreviation, 32, false),
    field('fakulteti oziroma članici', institution?.name, 25),
    field('zavodu', university?.name, 20),
    field('strokovnem naslovu', [
      programme.professional_title.male,
      programme.professional_title.female,
      programme.professional_title.abbreviated,
    ].filter(Boolean).join(' '), 15),
    field('vrsti ali stopnji programa', [
      programme.type.name,
      programme.type.short_name,
      programme.cycle.name,
      programme.cycle.code,
    ].filter(Boolean).join(' '), 10),
  ].filter((searchField): searchField is SearchField => searchField !== null);
}

function buildPerformerSearchFields(
  teachers: ProgrammePerformerSearchTeacher[],
): SearchField[] {
  const fields: SearchField[] = [];

  teachers.forEach(([teacherName, researcherCode, courses], teacherIndex) => {
    const groupId = `teacher-${teacherIndex}`;
    const teacherMatch: SearchPerformerMatch = {
      teacherName,
      ...(researcherCode ? { researcherCode } : {}),
    };

    const teacherNameField = field(
      'učitelju',
      teacherName,
      38,
      true,
      teacherMatch,
      groupId,
      1,
    );
    if (teacherNameField) fields.push(teacherNameField);

    const researcherCodeField = field(
      'raziskovalni šifri',
      researcherCode,
      100,
      false,
      teacherMatch,
      groupId,
    );
    if (researcherCodeField) fields.push(researcherCodeField);

    for (const [courseName, courseNameEn, courseCode] of courses) {
      const courseMatch: SearchPerformerMatch = {
        ...teacherMatch,
        courseName,
      };
      const courseNameField = field(
        'predmetu',
        courseName,
        32,
        true,
        courseMatch,
        groupId,
      );
      if (courseNameField) fields.push(courseNameField);

      const courseNameEnField = field(
        'angleškem imenu predmeta',
        courseNameEn,
        24,
        true,
        courseMatch,
        groupId,
      );
      if (courseNameEnField) fields.push(courseNameEnField);

      const courseCodeField = field(
        'šifri predmeta',
        courseCode,
        80,
        false,
        courseMatch,
        groupId,
      );
      if (courseCodeField) fields.push(courseCodeField);
    }
  });

  return fields;
}

function field(
  label: string,
  value: string | null | undefined,
  weight: number,
  allowFuzzy = true,
  performer?: SearchPerformerMatch,
  groupId?: string,
  maximumFuzzyDistance?: number,
): SearchField | null {
  if (!value) return null;
  const normalized = normalizeSearchText(value);
  if (!normalized) return null;

  return {
    label,
    normalized,
    tokens: uniqueTokens(tokenize(normalized)),
    weight,
    allowFuzzy,
    ...(maximumFuzzyDistance !== undefined ? { maximumFuzzyDistance } : {}),
    ...(groupId ? { groupId } : {}),
    ...(performer ? { performer } : {}),
  };
}

function tokenize(value: string): string[] {
  return value.split(/\s+/).filter((token) => token.length >= 2 || /^\d+$/.test(token));
}

function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

function bestTermMatch(queryToken: string, fields: SearchField[]): TermMatch | null {
  let bestMatch: TermMatch | null = null;

  for (const searchField of fields) {
    for (const candidate of searchField.tokens) {
      const kind = tokenMatchKind(queryToken, candidate, searchField);
      if (!kind) continue;

      const score = searchField.weight * matchMultiplier(kind, queryToken, candidate);
      if (
        !bestMatch
        || matchKindPriority(kind) > matchKindPriority(bestMatch.kind)
        || (kind === bestMatch.kind && score > bestMatch.score)
      ) {
        bestMatch = { field: searchField, kind, score };
      }
    }
  }

  return bestMatch;
}

function bestPerformerGroupMatches(
  queryTokens: string[],
  fields: SearchField[],
): Array<{ performer: SearchPerformerMatch; score: number }> {
  const groups = new Map<string, SearchField[]>();

  for (const searchField of fields) {
    if (!searchField.groupId || !searchField.performer) continue;
    const group = groups.get(searchField.groupId) ?? [];
    group.push(searchField);
    groups.set(searchField.groupId, group);
  }

  const matches: Array<{ performer: SearchPerformerMatch; score: number }> = [];

  for (const groupFields of groups.values()) {
    const termMatches = queryTokens
      .map((queryToken) => bestTermMatch(queryToken, groupFields))
      .filter((match): match is TermMatch => match !== null);
    if (termMatches.length !== queryTokens.length) continue;

    const courseMatch = termMatches.find((match) => match.field.performer?.courseName);
    const performer = courseMatch?.field.performer ?? termMatches[0]?.field.performer;
    if (!performer) continue;

    matches.push({
      performer,
      score: termMatches.reduce((total, match) => total + match.score, 0),
    });
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .filter((match, index, allMatches) =>
      allMatches.findIndex((candidate) =>
        candidate.performer.teacherName === match.performer.teacherName
        && candidate.performer.courseName === match.performer.courseName,
      ) === index,
    )
    .slice(0, 2);
}

function uniquePerformerMatches(termMatches: TermMatch[]): SearchPerformerMatch[] {
  return termMatches
    .flatMap((match) => match.field.performer ? [match.field.performer] : [])
    .filter((performer, index, performers) =>
      performers.findIndex((candidate) =>
        candidate.teacherName === performer.teacherName
        && candidate.courseName === performer.courseName,
      ) === index,
    )
    .slice(0, 2);
}

function matchKindPriority(kind: MatchKind): number {
  if (kind === 'exact') return 3;
  if (kind === 'prefix') return 2;
  return 1;
}

function tokenMatchKind(
  queryToken: string,
  candidate: string,
  searchField: SearchField,
): MatchKind | null {
  if (candidate === queryToken) return 'exact';
  if (queryToken.length >= 3 && candidate.startsWith(queryToken)) return 'prefix';
  if (!searchField.allowFuzzy || queryToken.length < 4) return null;

  const maximumDistance = searchField.maximumFuzzyDistance
    ?? (queryToken.length <= 7 ? 1 : 2);
  if (Math.abs(queryToken.length - candidate.length) > maximumDistance) return null;

  return boundedLevenshteinDistance(queryToken, candidate, maximumDistance) <= maximumDistance
    ? 'fuzzy'
    : null;
}

function matchMultiplier(kind: MatchKind, queryToken: string, candidate: string): number {
  if (kind === 'exact') return 1;
  if (kind === 'prefix') return 0.72 + (queryToken.length / candidate.length) * 0.18;

  const maximumLength = Math.max(queryToken.length, candidate.length);
  const distance = boundedLevenshteinDistance(queryToken, candidate, 2);
  return 0.35 + (1 - distance / maximumLength) * 0.2;
}

function bestPhraseBonus(query: string, fields: SearchField[]): number {
  let bestBonus = 0;

  for (const searchField of fields) {
    let bonus = 0;
    if (searchField.normalized === query) {
      bonus = searchField.weight * 1.5;
    } else if (searchField.normalized.startsWith(query)) {
      bonus = searchField.weight * 0.8;
    } else if (searchField.normalized.includes(query)) {
      bonus = searchField.weight * 0.4;
    }
    bestBonus = Math.max(bestBonus, bonus);
  }

  return bestBonus;
}

function boundedLevenshteinDistance(left: string, right: string, limit: number): number {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > limit) return limit + 1;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const distance = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + substitutionCost,
      );
      current[rightIndex] = distance;
      rowMinimum = Math.min(rowMinimum, distance);
    }

    if (rowMinimum > limit) return limit + 1;
    previous = current;
  }

  return previous[right.length] ?? limit + 1;
}
